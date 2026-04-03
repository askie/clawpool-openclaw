---
name: grix-admin
description: 通过 Grix Agent API 协议创建API agent，并直接完成本地 OpenClaw agent 与 Grix 渠道绑定配置（默认直接应用并返回结果）。
---

# Grix Agent Admin

Create a remote API agent, then complete local OpenClaw agent + grix channel binding in one flow.

## Security + Auth Path

1. This skill does **not** ask the user for website account/password.
2. Remote create action uses local `channels.grix` credentials and `Authorization: Bearer <agent_api_key>`.
3. Local OpenClaw config is handled by `scripts/grix_agent_bind.py`.

## Required Input

1. `agentName` (required): regex `^[a-z][a-z0-9-]{2,31}$`
2. `describeMessageTool` (required): must contain non-empty `actions`
3. `accountId` (optional)
4. `avatarUrl` (optional)

## Full Workflow

### 0. Routing Check (Fallback to grix-register)

Before executing anything, check the local configuration file: `~/.openclaw/openclaw.json`. 
If `channels.grix.apiKey` is **missing or empty**, it means the main OpenClaw channel has not been bootstrapped. You must immediately state "Main channel not configured, handing over to grix-register" and **call the `grix-register` skill** to handle account creation and token retrieval.
Only proceed with Step A and B below if `channels.grix.apiKey` already exists and is valid.

### A. Create Remote API Agent

1. Validate `agentName` and `describeMessageTool`.
2. Call `grix_agent_admin` once.
3. Read result fields: `id`, `agent_name`, `api_endpoint`, `api_key`, `api_key_hint`.

### B. Apply Local OpenClaw Binding Directly

Run with `--apply` directly:

```bash
scripts/grix_agent_bind.py configure-local-openclaw \
  --agent-name <agent_name> \
  --agent-id <agent_id> \
  --api-endpoint '<api_endpoint>' \
  --api-key '<api_key>' \
  --apply
```

This applies:

1. upsert `agents.list` for `<agent_name>`
2. upsert `channels.grix.accounts.<agent_name>`
3. upsert `bindings` route to `channel=grix`, `accountId=<agent_name>`
4. ensure required tools (`message`, `grix_group`, `grix_agent_admin`)
5. create workspace defaults under `~/.openclaw/workspace-<agent_name>/`
6. run `openclaw gateway restart`

### C. Optional Verification

If you need explicit post-check state, run:

```bash
scripts/grix_agent_bind.py inspect-local-openclaw --agent-name <agent_name>
```

## Guardrails

1. Never ask user for website account/password.
2. Treat remote create as non-idempotent; do not auto-retry without confirmation.
3. Keep full `api_key` one-time only; do not repeatedly echo it.
4. Do not claim success before apply command returns success.

## Error Handling Rules

1. invalid name: ask user for a valid English lowercase name.
2. `403/20011`: ask owner to grant `agent.api.create` scope.
3. `401/10001`: verify local `agent_api_key` / grix account config.
4. `409/20002`: ask for another agent name.
5. local apply failed: return concrete failed command/result and stop.

## Response Style

1. Report two stages separately: remote create status + local binding status.
2. Include created `agent_id`, `agent_name`, `api_endpoint`, `api_key_hint`.
3. Clearly state local config has been applied (or failed with concrete reason).

## References

1. Load [references/api-contract.md](references/api-contract.md).
2. Use [scripts/grix_agent_bind.py](scripts/grix_agent_bind.py) for local binding apply.
