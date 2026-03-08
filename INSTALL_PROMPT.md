# Install Prompt For OpenClaw

Copy and paste the prompt below into OpenClaw if you want it to install this plugin automatically.

```text
Install the OpenClaw plugin from https://github.com/AshFores/openclaw-auto-resume-lite and fully activate it.

Requirements:
- Clone the repo locally if needed.
- Install it with `openclaw plugins install --link`.
- Enable the plugin `auto-resume-lite`.
- Ensure `plugins.allow` includes `auto-resume-lite`.
- Restart the OpenClaw gateway.
- Verify the plugin is loaded with `openclaw plugins list` or `openclaw plugins doctor`.

Implementation constraints:
- Prefer installing it into a stable path under `~/.openclaw/plugins/auto-resume-lite` instead of a temporary project directory.
- If the plugin already exists, update it in place instead of creating duplicates.
- Do not stop after describing the plan. Execute the installation steps and report the final status.
```

## What this prompt asks OpenClaw to do

- put the plugin in a stable directory
- install and enable it
- add explicit trust via `plugins.allow`
- restart the gateway
- confirm successful load
