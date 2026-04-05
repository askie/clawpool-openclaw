# API Contract

## Purpose

`grix-admin` 负责本地绑定，支持两种入口：

1. `bind-local`：接收 `grix-register` 交接参数，直接本地绑定。
2. `create-and-bind`：在已有主密钥下先远端创建，再本地绑定。

## Base Rules

1. Base path: `/v1/agent-api`
2. Auth: `Authorization: Bearer <agent_api_key>`
3. Caller must be `provider_type=3` and `status=active`.
4. Route must pass scope middleware before service business checks.
5. Do not ask users to provide website account/password for this flow.

## Action Mapping (create-and-bind only)

| Tool | Method | Route | Required Scope |
|---|---|---|---|
| `grix_agent_admin` | `POST` | `/agents/create` | `agent.api.create` |

## Payload Template

```json
{
  "agentName": "ops-assistant",
  "avatarUrl": "https://example.com/avatar.png",
  "describeMessageTool": {
    "actions": ["unsend", "delete"]
  }
}
```

`agentName` validation rule for this skill:

- regex: `^[a-z][a-z0-9-]{2,31}$`
- only lowercase English letters, digits, and hyphen

`describeMessageTool` is required and must align with OpenClaw SDK discovery shape (`actions` required, optional `capabilities` and `schema`).

## Success Payload Highlights

```json
{
  "code": 0,
  "data": {
    "id": "2029786829095440384",
    "agent_name": "ops-assistant",
    "provider_type": 3,
    "api_endpoint": "ws://host/v1/agent-api/ws?agent_id=2029786829095440384",
    "api_key": "ak_2029786829095440384_xxx",
    "api_key_hint": "xxxxxx12"
  }
}
```

## Error Matrix

| HTTP/BizCode | Meaning | Skill Response |
|---|---|---|
| `403/20011` | `agent.api.create` scope missing | Ask owner to grant scope |
| `401/10001` | invalid or missing auth | Check `api_key` and account config |
| `403/10002` | caller agent inactive / invalid provider | Ask owner to activate caller agent |
| `409/20002` | duplicate agent name | Ask user for another `agent_name` |
| `400/20004` | owner quota exceeded | Ask owner to clean up unused agents |
| `400/10003` | invalid payload | Ask for corrected parameters |

## Retry Policy

1. Never auto-retry `agent_api_create` unless user explicitly confirms.
2. Do not retry scope/auth/parameter failures.
3. Network transient errors can be retried once after explicit confirmation.

## Post-Create Handover

After `code=0` (or when using `bind-local` mode), continue with local OpenClaw binding through official CLI config commands:

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
   - `bindings`
   - `tools.profile`
   - `tools.alsoAllow`
   - `tools.sessions.visibility`
4. write merged config back with `openclaw config set ... --strict-json`:
   - `channels.grix.accounts.<agent_name>`
   - `agents.list`
   - `bindings`
   - `tools.profile`
   - `tools.alsoAllow`
   - `tools.sessions.visibility`
   - if `channels.grix.enabled=false`, set it back to `true`
5. validate after write:
   - `openclaw config validate`
   - `openclaw config get --json channels.grix.accounts.<agent_name>`
   - `openclaw config get --json agents.list`
   - `openclaw config get --json bindings`
6. do not run `openclaw gateway restart` inside an active install chat; `openclaw config set` should hot-reload the config immediately

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

In this mode, skip remote create and execute local bind directly.
