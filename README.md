# OpenClaw Auto Resume Lite

Lightweight OpenClaw plugin that tries to keep an agent moving when a run stops before the task is done.

It is designed for the common failure modes seen in long-running OpenClaw sessions:

- LLM timeout
- tool-call failure
- assistant stops after saying it will continue, but does not actually execute the next step

Instead of changing OpenClaw's core loop, this plugin uses OpenClaw's plugin hooks plus `system events` and a `heartbeat wake` to schedule one more recovery run automatically.

## What It Does

The plugin watches three hook points:

- `llm_output`
- `after_tool_call`
- `agent_end`

From those, it keeps a minimal per-run state and detects:

1. `timeout`
2. `tool_error`
3. `non_action`

When one of those conditions is detected, it:

1. injects a recovery instruction into the current session as a system event
2. requests a heartbeat wake for that session
3. lets OpenClaw continue in a fresh follow-up run

## Why "Lite"

This plugin is intentionally small.

It does **not** try to become a full workflow engine with heavy task orchestration, external queues, or deep state machines. It is meant to be a pragmatic stability layer that improves OpenClaw's behavior without making the core runtime bloated.

## Current Recovery Rules

- If a run ends with an error and the error looks like a timeout, schedule a recovery run.
- If a run hits tool errors and never gets a successful tool call, schedule a recovery run.
- If a run ends successfully but only outputs intent language like "let me continue" without any tool call, schedule a recovery run.

## Safety Limits

The plugin includes two built-in brakes:

- `maxAutoResumes`
- `cooldownMs`

Default values:

- `maxAutoResumes = 3`
- `cooldownMs = 15000`

That prevents easy infinite loops or extremely noisy retries.

## Install

### Local path

```bash
openclaw plugins install --link /path/to/openclaw-auto-resume-lite
openclaw plugins enable auto-resume-lite
openclaw daemon restart
```

### From GitHub

After publishing this repo, OpenClaw users can install it from the repo path supported by `openclaw plugins install`.

## Config

Example:

```json
{
  "plugins": {
    "entries": {
      "auto-resume-lite": {
        "enabled": true,
        "maxAutoResumes": 3,
        "cooldownMs": 15000
      }
    }
  }
}
```

Available options:

- `enabled`: `true | false`
- `maxAutoResumes`: integer, default `3`
- `cooldownMs`: integer, default `15000`

## Limitations

This plugin improves recovery, but it is not magic.

- It does not guarantee eventual success for every task.
- It does not replace durable checkpoints or structured task state.
- It works best when the agent can verify state from files and logs, instead of relying only on chat context.

## Recommended Pairing

For better real-world results, pair this plugin with:

- shorter session context windows
- periodic checkpoints written to disk
- stable model selection instead of highly variable `auto` routing

## Files

- `index.js`: plugin implementation
- `openclaw.plugin.json`: OpenClaw plugin manifest
- `package.json`: package metadata

## License

MIT
