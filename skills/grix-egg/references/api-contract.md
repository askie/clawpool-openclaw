# API Contract

## Purpose

Unify remote API communication in `grix-egg` with the same typed tool pathway used by other grix-admin skills.

## Base Rules

1. Base path is `/v1/agent-api`.
2. Auth is `Authorization: Bearer <agent_api_key>`.
3. Caller must be `provider_type=3` and `status=active`.
4. `grix-egg` must not send direct HTTP requests to Grix by itself.

## Unified Tool Path

Use only these entry points for remote communication:

| Install intent | Tool | Notes |
|---|---|---|
| Contact/session/message lookup | `grix_query` | Read-only queries |
| Group lifecycle and membership ops | `grix_group` | Governance operations |
| Create remote API agent | `grix_agent_admin` | Returns `id`, `agent_name`, `api_endpoint`, `api_key`, `api_key_hint` |

Local OpenClaw binding remains a local CLI operation via `openclaw config`:

1. 先用 `openclaw config get --json channels.grix.accounts`、`openclaw config get --json agents.list`、`openclaw config get --json bindings`、`openclaw config get --json tools.profile`、`openclaw config get --json tools.alsoAllow`、`openclaw config get --json tools.sessions.visibility` 读取当前值；若路径不存在，按空对象 / 空数组处理，再合并本次目标项。
2. 再逐项写入：
   - `openclaw config set channels.grix.accounts.<agent_name> '<ACCOUNT_JSON>' --strict-json`
   - `openclaw config set agents.list '<NEXT_AGENTS_LIST_JSON>' --strict-json`
   - `openclaw config set bindings '<NEXT_BINDINGS_JSON>' --strict-json`
   - `openclaw config set tools.profile '"coding"' --strict-json`
   - `openclaw config set tools.alsoAllow '["message","grix_query","grix_group","grix_agent_admin"]' --strict-json`
   - `openclaw config set tools.sessions.visibility '"agent"' --strict-json`
3. 写完后执行 `openclaw config validate`，并用 `openclaw config get --json` 确认目标项已经存在。
4. `openclaw config set` 会走 OpenClaw 自己的配置管理并触发热重载；不要用 `grix_agent_bind.py` 或手工改 `openclaw.json` 替代它。

## Prohibited Paths

1. Do not use `curl`, `fetch`, `axios`, or custom temporary scripts to call `/v1/agent-api/*`.
2. Do not bypass typed tools with hidden protocol payloads.
3. Do not auto-retry non-idempotent create actions without explicit confirmation.

## Retry Policy

1. Scope/auth/parameter errors: no automatic retry.
2. Transient network failure: at most one retry, and only after explicit confirmation.
3. Installation status payloads (`channelData.grix.eggInstall`) must still be emitted on terminal success/failure.
4. On terminal success, emit one additional agent profile payload (`channelData.grix.userProfile`) for the final target agent before sending the plain-language next-step guidance.
