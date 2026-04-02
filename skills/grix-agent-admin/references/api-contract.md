# API Contract

## Purpose

Map remote provisioning action to Aibot Agent API HTTP route, then hand over to local OpenClaw binding.

## Base Rules

1. Base path: `/v1/agent-api`
2. Auth: `Authorization: Bearer <agent_api_key>`
3. Caller must be `provider_type=3` and `status=active`.
4. Route must pass scope middleware before service business checks.
5. Do not ask users to provide website account/password for this flow.

## Action Mapping (v1)

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

After `code=0`, continue with local OpenClaw binding via bundled script:

1. apply local changes directly:
   - `scripts/grix_agent_bind.py configure-local-openclaw --agent-name <agent_name> --agent-id <agent_id> --api-endpoint '<api_endpoint>' --api-key '<api_key>' --apply`
2. optionally run inspect after apply when you need state verification:
   - `scripts/grix_agent_bind.py inspect-local-openclaw --agent-name <agent_name>`

Local apply writes:

1. `agents.list` entry
2. `channels.grix.accounts.<agent_name>` entry
3. `bindings` route for `channel=grix`
4. required tools config and gateway restart
