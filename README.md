# OpenClaw Auto Resume Lite

`auto-resume-lite` is a lightweight OpenClaw plugin for one specific job: keep an agent moving when a run stops before the task is actually finished.

## 快速安装

适合遇到这几类问题的 OpenClaw 用户：

- 任务做到一半因为超时中断
- 工具调用失败后直接停住
- 模型说“我继续处理”，但没有真正执行下一步

最快安装方式：

```bash
git clone https://github.com/AshFores/openclaw-auto-resume-lite.git
openclaw plugins install --link ./openclaw-auto-resume-lite
openclaw plugins enable auto-resume-lite
openclaw daemon restart
```

如果你想直接让 OpenClaw 自动安装，复制 [INSTALL_PROMPT.md](./INSTALL_PROMPT.md) 里的 prompt 给它即可。

It targets the failure patterns that show up most often in long-running OpenClaw sessions:

- `LLM` timeout
- tool-call failure
- assistant says it will continue, but ends the run without taking action

Instead of patching OpenClaw's core agent loop into a large workflow engine, this plugin uses OpenClaw's existing plugin hooks, system events, and heartbeat wake mechanism to schedule a recovery run automatically.

## Goals

- Improve practical task completion for long-running agent sessions
- Add recovery behavior without making OpenClaw itself heavy
- Stay small, understandable, and easy to remove

## How It Works

The plugin watches these hook points:

- `llm_output`
- `after_tool_call`
- `agent_end`

It keeps a small per-run state and classifies interruptions into a few lightweight recovery categories:

- `timeout`
- `tool_error`
- `non_action`

When a recoverable interruption is detected, it:

1. injects a recovery instruction into the current session via a system event
2. requests a heartbeat wake for that session
3. lets OpenClaw continue in a fresh follow-up run

## Recovery Rules

- If a run ends with an error and the error looks like a timeout, schedule a recovery run.
- If a run hits tool errors and never reaches a successful tool call, schedule a recovery run.
- If a run ends after output that clearly signals intent to continue, but no concrete action was executed, schedule a recovery run.

## Safety Limits

This plugin includes two built-in brakes to reduce retry loops:

- `maxAutoResumes`
- `cooldownMs`

Default values:

- `maxAutoResumes = 3`
- `cooldownMs = 15000`

## Installation

### CLI install

```bash
git clone https://github.com/AshFores/openclaw-auto-resume-lite.git
openclaw plugins install --link ./openclaw-auto-resume-lite
openclaw plugins enable auto-resume-lite
openclaw daemon restart
openclaw plugins list
```

### Copy-paste prompt for OpenClaw

If you want OpenClaw to install it for you, copy the prompt from [INSTALL_PROMPT.md](./INSTALL_PROMPT.md).

## Platform Notes

Tested on:

- macOS

Expected to work on:

- Linux
- Windows

Why:

- the plugin only uses Node.js standard libraries
- it relies on OpenClaw's plugin hooks, system events, and heartbeat wake APIs
- it does not depend on macOS-specific shell commands or platform-only tooling

Recommended stable install path:

- macOS / Linux: `~/.openclaw/plugins/auto-resume-lite`
- Windows: `%USERPROFILE%\\.openclaw\\plugins\\auto-resume-lite`

Caveat:

- Linux and Windows support is expected, but not yet fully validated in real user environments
- issues and PRs for platform-specific fixes are welcome

## Configuration

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

## Design Scope

This plugin is intentionally limited.

It does not try to become a full durable workflow runtime with:

- external job queues
- deep task graphs
- heavyweight checkpoint orchestration
- broad automatic success evaluation

The point is to improve failure recovery while staying easy to reason about.

## Limitations

- It does not guarantee eventual success for every task.
- It does not replace proper checkpoints or durable task state.
- It works best when the agent can verify truth from files, logs, and runtime state instead of relying only on chat context.

## Recommended Pairing

For better real-world stability, use it together with:

- shorter session context windows
- periodic checkpoints written to disk
- stable model selection instead of highly variable `auto` routing

## Repository Layout

- `index.js`: plugin implementation
- `openclaw.plugin.json`: OpenClaw plugin manifest
- `INSTALL_PROMPT.md`: copy-paste prompt for automatic installation
- `package.json`: package metadata

## License

MIT
