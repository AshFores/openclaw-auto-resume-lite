# Install Prompt For OpenClaw

Copy and paste the prompt below into OpenClaw if you want it to install this plugin automatically.

```text
Install the OpenClaw plugin from https://github.com/AshFores/openclaw-auto-resume-lite and fully activate it.

Requirements:
- Clone the repo locally if needed.
- Install it with `openclaw plugins install --link`.
- Ensure `plugins.allow` includes `auto-resume-lite`.
- Before enabling it broadly, decide whether this deployment includes human-facing direct chat channels such as Telegram, Feishu, Discord, Signal, or similar.
- If the deployment uses human-facing direct chat, ask the user/operator to confirm the intended scope before broadening auto-resume behavior.
- If no broader confirmation is given, enable the plugin only with a conservative default policy that deny-lists direct-chat session families where appropriate (for example `agent:main:telegram:` and `agent:main:feishu:`).
- Restart the OpenClaw gateway.
- Verify the plugin is loaded with `openclaw plugins list` or `openclaw plugins doctor`.

Implementation constraints:
- Prefer installing it into a stable path under `~/.openclaw/plugins/auto-resume-lite` on macOS/Linux, or `%USERPROFILE%\\.openclaw\\plugins\\auto-resume-lite` on Windows, instead of a temporary project directory.
- If the plugin already exists, update it in place instead of creating duplicates.
- Do not stop after describing the plan. Execute the installation steps and report the final status.
```

## What this prompt asks OpenClaw to do

- put the plugin in a stable directory
- install and enable it
- add explicit trust via `plugins.allow`
- restart the gateway
- confirm successful load
