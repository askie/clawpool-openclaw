# API Contract

## Responsibility Boundary

1. `grix-register` 仅负责账号鉴权与云端 `provider_type=3` Agent 参数产出。
2. 本技能不负责本地 OpenClaw 配置。
3. 本地配置由 `grix-admin` 接手。

## Base

1. Default website: `https://grix.dhf.pub/`
2. Default public Grix API base: `https://grix.dhf.pub/v1`
3. Local development or private deployment can override the base URL.

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
  "provider_type": 3,
  "is_main": true
}
```

`provider_type=3` means Agent API type.  
The bundled bootstrap flow uses `is_main=true` so the first API agent gets the full initial scope set.

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

## Handoff

成功后不要把结构化字段直接当成 `grix_admin` 的 typed params，而是组装成一条 `grix_admin.task`：

1. 第一行写 `bind-local`
2. 后续带上 `agent_id`
3. `agent_name`
4. `api_endpoint`
5. `api_key`
6. 补一行 `do_not_create_remote_agent=true`
