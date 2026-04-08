# API Contract

## Purpose

`grix-admin` 负责本地绑定，并在当前 agent 已具备 `agent.api.create` scope 时支持通过 `grix_admin` 走 WS 创建新的远端 API agent。

## Base Rules

1. Do not ask users to provide website account/password for this flow.
2. Remote create, when used, must go through `grix_admin` on the current account's authenticated WS channel.
3. If `agent_name` / `agent_id` / `api_endpoint` / `api_key` is incomplete and the current account cannot create, stop and ask for backend admin completion first.

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
   - `tools.alsoAllow` (global defaults only: `message`, `grix_query`, `grix_group`, `grix_register`, `grix_message_send`, `grix_message_unsend`)
   - if this target is the main agent, merge `grix_admin` / `grix_egg` / `grix_update` / `openclaw_memory_setup` into that agent's own `tools.alsoAllow` inside `agents.list`; do not place them in global `tools.alsoAllow`
   - `tools.sessions.visibility`
   - if `channels.grix.enabled=false`, set it back to `true`
5. validate after write:
   - `openclaw config validate`
   - `openclaw config get --json channels.grix.accounts.<agent_name>`
   - `openclaw config get --json agents.list`
   - `openclaw agents bindings --agent <agent_name> --json`
6. do not run `openclaw gateway restart` inside an active install chat; `openclaw config set` and `openclaw agents bind` should hot-reload the config immediately

## bind-local Input Contract

When called from `grix-register`, `grix-admin` should usually be entered through `grix_admin.task`:

```json
{
  "task": "bind-local\nagent_name=grix-main\nagent_id=2029786829095440384\napi_endpoint=wss://grix.dhf.pub/v1/agent-api/ws?agent_id=2029786829095440384\napi_key=ak_xxx\ndo_not_create_remote_agent=true"
}
```

In this mode, execute local bind directly.

## create-and-bind Input Contract

When the main agent already has a working Grix account plus `agent.api.create` scope, `grix-admin` can be entered through `grix_admin.task`, then create the remote API agent through one direct `grix_admin` call, then continue the local bind:

```json
{
  "task": "create-and-bind\naccountId=grix-main\nagentName=ops helper\nintroduction=负责发布和值班协作\nisMain=false"
}
```

In this mode:

1. call `grix_admin` exactly once without `task`
2. expect `createdAgent.id`, `createdAgent.agent_name`, `createdAgent.api_endpoint`, `createdAgent.api_key`
3. continue with the same local bind steps as `bind-local`
4. if the WS call fails with missing `agent.api.create`, ask owner to grant the scope before retrying
