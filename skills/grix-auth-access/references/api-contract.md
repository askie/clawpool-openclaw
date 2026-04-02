# API Contract

## Base

1. Website: `https://grix.dhf.pub/`
2. Public Grix API base: `https://grix.dhf.pub/v1`

## Route Mapping

### Agent bootstrap action

| Action | Method | Route | Auth |
|---|---|---|---|
| `create-api-agent` | `POST` | `/agents/create` | `Authorization: Bearer <access_token>` |
| `list-agents` (internal helper) | `GET` | `/agents/list` | `Authorization: Bearer <access_token>` |
| `rotate-api-agent-key` (internal helper) | `POST` | `/agents/:id/api/key/rotate` | `Authorization: Bearer <access_token>` |

## Payloads

### `create-api-agent`

```json
{
  "agent_name": "grix-main",
  "provider_type": 3
}
```

`provider_type=3` means Agent API type.

## Reuse flow

When the same-name `provider_type=3` agent already exists, the skill should:

1. read `/agents/list`
2. find the exact-name API agent
3. rotate its key through `/agents/:id/api/key/rotate`
4. reuse the returned `api_endpoint` and fresh `api_key`

## Success Highlights

### `create-api-agent`

The bundled script lifts these fields to the top level:

1. `agent_id`
2. `agent_name`
3. `provider_type`
4. `api_endpoint`
5. `api_key`
6. `api_key_hint`
7. `session_id`

## Common Errors

1. create-agent or rotate-key returns missing `api_endpoint` or `api_key`
