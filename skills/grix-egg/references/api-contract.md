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

Local binding remains a local operation via bundled script:

- `scripts/grix_agent_bind.py configure-local-openclaw ... --apply`

## Prohibited Paths

1. Do not use `curl`, `fetch`, `axios`, or custom temporary scripts to call `/v1/agent-api/*`.
2. Do not bypass typed tools with hidden protocol payloads.
3. Do not auto-retry non-idempotent create actions without explicit confirmation.

## Retry Policy

1. Scope/auth/parameter errors: no automatic retry.
2. Transient network failure: at most one retry, and only after explicit confirmation.
3. Installation status payloads (`channelData.grix.eggInstall`) must still be emitted on terminal success/failure.
4. On terminal success, emit one additional agent profile payload (`channelData.grix.userProfile`) for the final target agent before sending the plain-language next-step guidance.
