# API Contract

## Purpose

`grix-admin` 只负责本地绑定。

## Base Rules

1. Do not ask users to provide website account/password for this flow.
2. Remote API agent creation is no longer provided by this plugin.
3. If `agent_name` / `agent_id` / `api_endpoint` / `api_key` is incomplete, stop and ask for backend admin completion first.

## Local Bind Steps

After remote agent parameters are ready, continue with local OpenClaw binding through official CLI commands:

1. prepare local paths first:
   - `workspace=~/.openclaw/workspace-<agent_name>`
   - `agentDir=~/.openclaw/agents/<agent_name>/agent`
   - create minimal `AGENTS.md` / `MEMORY.md` / `USER.md` when missing
2. resolve `model` in this order:
   - existing local agent entry's `model`
   - `agents.defaults.model.primary`
   - if still empty, stop and report missing model explicitly
3. read current values; when a path is absent, treat it as empty object / empty array before merging:
   - `channels.grix.accounts`
   - `agents.list`
   - `tools.profile`
   - `tools.alsoAllow`
   - `tools.sessions.visibility`
   - if needed, inspect existing bindings with `openclaw agents bindings --agent <agent_name> --json`
4. write merged config back with official CLI commands:
   - `channels.grix.accounts.<agent_name>`
   - `agents.list`
   - `openclaw agents bind --agent <agent_name> --bind grix:<agent_name>`
   - `tools.profile`
   - `tools.alsoAllow`
   - `tools.sessions.visibility`
   - if `channels.grix.enabled=false`, set it back to `true`
5. validate after write:
   - `openclaw config validate`
   - `openclaw config get --json channels.grix.accounts.<agent_name>`
   - `openclaw config get --json agents.list`
   - `openclaw agents bindings --agent <agent_name> --json`
6. do not run `openclaw gateway restart` inside an active install chat; `openclaw config set` and `openclaw agents bind` should hot-reload the config immediately

## bind-local Input Contract

When called from `grix-register`, `grix-admin` should accept:

```json
{
  "mode": "bind-local",
  "agent_name": "grix-main",
  "agent_id": "2029786829095440384",
  "api_endpoint": "wss://grix.dhf.pub/v1/agent-api/ws?agent_id=2029786829095440384",
  "api_key": "ak_xxx"
}
```

In this mode, execute local bind directly.
