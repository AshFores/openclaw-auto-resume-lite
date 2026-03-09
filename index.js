import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULTS = {
  enabled: true,
  maxAutoResumes: 3,
  cooldownMs: 15000,
};

const INTENT_PATTERNS = [
  /\blet me\b/i,
  /\bi will\b/i,
  /\bi'll\b/i,
  /\bcontinue\b/i,
  /\bnext step\b/i,
  /\buse\s+(the\s+)?exec\b/i,
];

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getPluginConfig(api) {
  const raw = isObject(api.pluginConfig) ? api.pluginConfig : {};
  return {
    enabled: raw.enabled !== false,
    maxAutoResumes:
      Number.isInteger(raw.maxAutoResumes) && raw.maxAutoResumes > 0
        ? raw.maxAutoResumes
        : DEFAULTS.maxAutoResumes,
    cooldownMs:
      Number.isInteger(raw.cooldownMs) && raw.cooldownMs >= 0
        ? raw.cooldownMs
        : DEFAULTS.cooldownMs,
  };
}

function getStateFile(api) {
  const stateDir = api.runtime.state.resolveStateDir(process.env, os.homedir());
  return path.join(stateDir, "plugins", api.id, "state.json");
}

async function loadState(api) {
  const file = getStateFile(api);
  try {
    const raw = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(raw);
    if (!isObject(parsed)) {
      return { sessions: {}, runs: {} };
    }
    return {
      sessions: isObject(parsed.sessions) ? parsed.sessions : {},
      runs: isObject(parsed.runs) ? parsed.runs : {},
    };
  } catch {
    return { sessions: {}, runs: {} };
  }
}

async function saveState(api, state) {
  const file = getStateFile(api);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(state, null, 2), "utf-8");
}

function getRunState(state, runId) {
  if (!runId) {
    return null;
  }
  const runState = state.runs[runId];
  if (isObject(runState)) {
    return runState;
  }
  const created = {
    assistantTexts: [],
    toolCalls: 0,
    successfulToolCalls: 0,
    toolErrors: 0,
    lastToolError: "",
    detectedIntent: false,
    sessionKey: "",
    agentId: "",
    sessionId: "",
    updatedAt: Date.now(),
  };
  state.runs[runId] = created;
  return created;
}

function rememberRunContext(runState, ctx) {
  if (!runState || !ctx) {
    return;
  }
  if (typeof ctx.sessionKey === "string" && ctx.sessionKey.trim()) {
    runState.sessionKey = ctx.sessionKey.trim();
  }
  if (typeof ctx.agentId === "string" && ctx.agentId.trim()) {
    runState.agentId = ctx.agentId.trim();
  }
  if (typeof ctx.sessionId === "string" && ctx.sessionId.trim()) {
    runState.sessionId = ctx.sessionId.trim();
  }
  runState.updatedAt = Date.now();
}

function detectIntent(texts) {
  return texts.some((text) => INTENT_PATTERNS.some((pattern) => pattern.test(text)));
}

function summarizeError(error) {
  if (typeof error !== "string") {
    return "";
  }
  return error.trim().replace(/\s+/g, " ").slice(0, 280);
}

function buildResumeInstruction(reason, details) {
  const base =
    "Previous run stopped before completing the task. Continue automatically from the last valid state on disk. Do not restate the plan. Execute the next concrete step now.";
  if (reason === "tool_error") {
    return `${base} The last tool call failed${details ? `: ${details}.` : "."} Repair or bypass that failure and proceed.`;
  }
  if (reason === "timeout") {
    return `${base} The previous run timed out${details ? `: ${details}.` : "."} Resume from the last unfinished step with minimal context.`;
  }
  if (reason === "non_action") {
    return `${base} The previous run ended after describing intent without taking action. Execute exactly one concrete step first, then continue.`;
  }
  if (reason === "agent_error") {
    return `${base} The previous run ended with an error${details ? `: ${details}.` : "."} Recover and continue.`;
  }
  return base;
}

async function maybeScheduleResume(api, state, params) {
  const cfg = getPluginConfig(api);
  if (!cfg.enabled || !params.sessionKey) {
    return false;
  }

  const now = Date.now();
  const session = isObject(state.sessions[params.sessionKey]) ? state.sessions[params.sessionKey] : {};
  const lastResumeAt = Number.isFinite(session.lastResumeAt) ? session.lastResumeAt : 0;
  const consecutive = Number.isFinite(session.consecutiveAutoResumes) ? session.consecutiveAutoResumes : 0;
  const signature = `${params.runId || "no-run"}:${params.reason}`;

  if (session.lastResumeSignature === signature) {
    return false;
  }
  if (now - lastResumeAt < cfg.cooldownMs) {
    return false;
  }
  if (consecutive >= cfg.maxAutoResumes) {
    api.logger.warn(`auto-resume limit reached for session ${params.sessionKey}`, {
      reason: params.reason,
      consecutive,
    });
    return false;
  }

  const instruction = buildResumeInstruction(params.reason, params.details);
  api.runtime.system.enqueueSystemEvent(instruction, {
    sessionKey: params.sessionKey,
    contextKey: `auto-resume-lite:${signature}`,
  });
  api.runtime.system.requestHeartbeatNow({
    reason: `auto-resume-lite:${params.reason}`,
    agentId: params.agentId || undefined,
    sessionKey: params.sessionKey,
    coalesceMs: 2000,
  });

  state.sessions[params.sessionKey] = {
    ...session,
    lastResumeAt: now,
    lastResumeSignature: signature,
    lastReason: params.reason,
    consecutiveAutoResumes: consecutive + 1,
    agentId: params.agentId || session.agentId || "",
    sessionId: params.sessionId || session.sessionId || "",
  };
  await saveState(api, state);

  api.logger.info(`scheduled auto-resume for ${params.sessionKey}`, {
    reason: params.reason,
    runId: params.runId,
  });
  return true;
}

function clearResumePressure(state, sessionKey) {
  if (!sessionKey) {
    return;
  }
  const session = isObject(state.sessions[sessionKey]) ? state.sessions[sessionKey] : null;
  if (!session) {
    return;
  }
  state.sessions[sessionKey] = {
    ...session,
    consecutiveAutoResumes: 0,
    lastReason: "",
  };
}

function pruneRuns(state) {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const [runId, runState] of Object.entries(state.runs)) {
    const updatedAt = Number.isFinite(runState?.updatedAt) ? runState.updatedAt : 0;
    if (updatedAt < cutoff) {
      delete state.runs[runId];
    }
  }
}

function findLatestRunForSession(state, sessionId) {
  return findLatestRun(state, { sessionId });
}

function findLatestRun(state, criteria = {}) {
  const { sessionId = "", sessionKey = "" } = criteria;
  if (!sessionId && !sessionKey) {
    return { runId: "", runState: null };
  }
  const match = Object.entries(state.runs)
    .filter(([, entry]) => {
      if (!entry) {
        return false;
      }
      if (sessionId && entry.sessionId === sessionId) {
        return true;
      }
      if (sessionKey && entry.sessionKey === sessionKey) {
        return true;
      }
      return false;
    })
    .sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0))[0];
  if (!match) {
    return { runId: "", runState: null };
  }
  return { runId: match[0], runState: match[1] };
}

const plugin = {
  id: "auto-resume-lite",
  name: "Auto Resume Lite",
  description: "Lightweight auto-resume for interrupted agent runs.",
  register(api) {
    api.on("llm_output", async (event, ctx) => {
      const state = await loadState(api);
      const runState = getRunState(state, event.runId);
      if (!runState) {
        return;
      }
      rememberRunContext(runState, ctx);
      runState.assistantTexts = Array.isArray(event.assistantTexts)
        ? event.assistantTexts.filter((text) => typeof text === "string").slice(-8)
        : [];
      runState.detectedIntent = detectIntent(runState.assistantTexts);
      pruneRuns(state);
      await saveState(api, state);
    });

    api.on("after_tool_call", async (event, ctx) => {
      const state = await loadState(api);
      const runState = getRunState(state, event.runId);
      if (!runState) {
        return;
      }
      rememberRunContext(runState, ctx);
      runState.toolCalls += 1;
      if (event.error) {
        runState.toolErrors += 1;
        runState.lastToolError = summarizeError(event.error);
      } else {
        runState.successfulToolCalls += 1;
      }
      pruneRuns(state);
      await saveState(api, state);
    });

    api.on("agent_end", async (event, ctx) => {
      const state = await loadState(api);
      const { runId, runState } = findLatestRun(state, {
        sessionId: ctx.sessionId,
        sessionKey: ctx.sessionKey,
      });
      const effectiveRunState = runState;

      const sessionKey = ctx.sessionKey || effectiveRunState?.sessionKey || "";
      const agentId = ctx.agentId || effectiveRunState?.agentId || "";
      const sessionId = ctx.sessionId || effectiveRunState?.sessionId || "";

      if (!sessionKey) {
        return;
      }

      const errorText = summarizeError(event.error || "");
      const sawAnyToolError =
        effectiveRunState &&
        effectiveRunState.toolErrors > 0;
      const nonActionStop =
        event.success &&
        effectiveRunState &&
        effectiveRunState.detectedIntent;

      api.logger.info(`auto-resume-lite agent_end observed`, {
        success: event.success,
        sessionKey,
        sessionId,
        runId,
        toolCalls: effectiveRunState?.toolCalls || 0,
        toolErrors: effectiveRunState?.toolErrors || 0,
        successfulToolCalls: effectiveRunState?.successfulToolCalls || 0,
        detectedIntent: effectiveRunState?.detectedIntent || false,
        errorText,
      });

      let scheduled = false;
      if (!event.success) {
        const reason = /timed out|timeout/i.test(errorText) ? "timeout" : sawAnyToolError ? "tool_error" : "agent_error";
        scheduled = await maybeScheduleResume(api, state, {
          reason,
          details: sawAnyToolError ? effectiveRunState.lastToolError || errorText : errorText,
          sessionKey,
          agentId,
          sessionId,
          runId,
        });
      } else if (sawAnyToolError || nonActionStop) {
        scheduled = await maybeScheduleResume(api, state, {
          reason: sawAnyToolError ? "tool_error" : "non_action",
          details: effectiveRunState?.lastToolError || "",
          sessionKey,
          agentId,
          sessionId,
          runId,
        });
      } else {
        clearResumePressure(state, sessionKey);
      }

      if (runId) {
        delete state.runs[runId];
      }

      pruneRuns(state);
      await saveState(api, state);
    });

    api.on("before_reset", async (_event, ctx) => {
      const state = await loadState(api);
      if (ctx.sessionKey) {
        delete state.sessions[ctx.sessionKey];
      }
      pruneRuns(state);
      await saveState(api, state);
    });
  },
};

export default plugin;
