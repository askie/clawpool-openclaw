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
| Contact/session/message lookup | `grix_query` | Read-only queries; every call must include the exact current `accountId`; contact/session search may need pagination |
| Group lifecycle and membership ops | `grix_group` | Governance operations; every call must include the exact current `accountId` |
| Create remote API agent | backend admin path | Prepare `id`, `agent_name`, `api_endpoint`, `api_key`; plugin no longer exposes a create tool |

Local OpenClaw binding remains a local CLI operation via the official `openclaw` commands:

1. 先用 `openclaw config get --json channels.grix.accounts`、`openclaw config get --json agents.list`、`openclaw config get --json tools.profile`、`openclaw config get --json tools.alsoAllow`、`openclaw config get --json tools.sessions.visibility` 读取当前值；若路径不存在，按空对象 / 空数组处理，再合并本次目标项；如需确认已有 Grix 绑定，额外用 `openclaw agents bindings --agent <agent_name> --json` 查看。
2. 再逐项写入：
   - `openclaw config set channels.grix.accounts.<agent_name> '<ACCOUNT_JSON>' --strict-json`
   - `openclaw config set agents.list '<NEXT_AGENTS_LIST_JSON>' --strict-json`
   - `openclaw agents bind --agent <agent_name> --bind grix:<agent_name>`
   - `openclaw config set tools.profile '"coding"' --strict-json`
   - `openclaw config set tools.alsoAllow '["message","grix_query","grix_group","grix_register"]' --strict-json`
   - `openclaw config set tools.sessions.visibility '"agent"' --strict-json`
3. 写完后执行 `openclaw config validate`，并用 `openclaw config get --json` 确认 account / agent / tools 目标项已经存在，再用 `openclaw agents bindings --agent <agent_name> --json` 确认目标绑定已经存在。
4. `openclaw config set` 和 `openclaw agents bind` 都会走 OpenClaw 自己的配置管理并触发热重载；不要用 `grix_agent_bind.py` 或手工改 `openclaw.json` 替代它。

## Prohibited Paths

1. Do not use `curl`, `fetch`, `axios`, or custom temporary scripts to call `/v1/agent-api/*`.
2. Do not bypass typed tools with hidden protocol payloads.
3. Do not auto-retry non-idempotent create actions without explicit confirmation.

## Retry Policy

1. Scope/auth/parameter errors: no automatic retry.
2. Transient network failure: at most one retry, and only after explicit confirmation.
3. Pagination is not a retry: `grix_query` can continue with additional pages when the current page is insufficient.
4. Installation status payloads (`channelData.grix.eggInstall`) must still be emitted on terminal success/failure.
5. On terminal success, emit one additional agent profile payload (`channelData.grix.userProfile`) for the final target agent before sending the plain-language next-step guidance.
