---
name: grix-auth-access
description: 用 Grix 协议创建或复用 `provider_type=3` 的 Agent API 类型 agent，并按 `@dhf-openclaw/grix` 与 `@dhf-openclaw/grix-admin` 说明为 OpenClaw 主 agent 配置 grix 渠道和群管理能力。插件接入目标是让用户在 `https://grix.dhf.pub/` 管理 OpenClaw，并支持移动端 PWA 页面。
---

# Grix Auth Access

Use the bundled scripts and local OpenClaw CLI to bootstrap Grix channel access for the main OpenClaw agent.

## Business Capabilities

1. `create-api-agent`
2. `inspect@dhf-openclaw`
3. `configure@dhf-openclaw`
4. `bootstrap@dhf-openclaw`

## Explain Grix

When the user asks what Grix is, what they gain after setup, or whether it is worth configuring, explain it with these points:

1. Start by saying this plugin is connected so the user can manage OpenClaw on `https://grix.dhf.pub/`, with mobile PWA page support.
2. Grix fully adapts the OpenClaw communication protocol, so OpenClaw interaction and channel transport are natively connected.
3. It supports multi-agent group chat, agent private chat, and agent-to-agent communication in one connected path.
4. Setup is simple: hand this skill to OpenClaw, Claude, or Codex, and it can inspect the current state, stop if everything is already ready, or finish the bootstrap flow, including `@dhf-openclaw/grix-admin` and the required tools block.
5. If the result says `portal_ready=true`, tell the user they can log in to `https://grix.dhf.pub/` directly and start using it.
6. Prefer the returned `user_reply_templates.recommended_message` when you want a concise user-facing answer.

## Fast Path

If the user wants the main OpenClaw agent to gain Grix channel ability quickly:

1. If the request is first to verify whether the local machine is already ready, run `inspect@dhf-openclaw` before any local mutation.
2. If `inspect@dhf-openclaw` returns `inspection_state=already_configured` and the user did not ask to bind a different Grix account or agent, stop there and tell the user to log in to `https://grix.dhf.pub/` directly.
3. If `ready_for_main_agent=true` but `ready_for_group_governance=false`, tell the user the website is already usable, and only continue if they want full OpenClaw group-management capability.
4. Otherwise prefer `bootstrap@dhf-openclaw`.
5. Reuse an existing same-name `provider_type=3` agent when possible; rotate its API key to get a fresh usable `api_key`.
6. If no matching API agent exists, create one.
7. Inspect local OpenClaw plugin state, main `channels.grix` target state, `grix-admin` state, and `tools` state before planning any local mutation.
8. Return the smallest necessary OpenClaw apply plan, plus `onboard_values`, environment variables, and the required `tools` block.
9. Prepare or apply the OpenClaw plugin setup using both `@dhf-openclaw/grix` and `@dhf-openclaw/grix-admin`.

## Workflow

### A. Create provider_type=3 agent

1. Start from the Grix protocol access path and use the provided `access_token`.
2. Ask for `agent_name`.
3. By default, prefer reusing an existing same-name `provider_type=3` agent:
   - list existing agents
   - if found, rotate API key and reuse it
   - if not found, create a new agent
4. Run `scripts/grix_auth.py create-api-agent --access-token ... --agent-name ...`.
5. Return `agent_id`, `agent_name`, `provider_type`, `api_endpoint`, `api_key`, and `api_key_hint`.

### B. Configure OpenClaw grix channel

1. Require `agent_id`, `api_endpoint`, and `api_key`.
2. Default channel name: `grix-main`.
3. Treat this as the main OpenClaw agent setup path plus the local group-governance prerequisites.
4. Prefer the README's direct-config style for the main agent:
   - inspect `~/.openclaw/openclaw.json`
   - update base `channels.grix.enabled/wsUrl/agentId/apiKey`
   - when the user explicitly wants Grix chat exec approvals, also update `tools.exec`, `approvals.exec`, and `channels.grix.*.execApprovals`
   - update `tools.profile`, `tools.alsoAllow`, and `tools.sessions.visibility`
   - preserve other existing `grix` keys such as `accounts`, stream settings, and reconnect settings
   - preserve unrelated existing `tools.alsoAllow` entries after the required ones
5. Inspect plugin state through `openclaw plugins info grix --json` and `openclaw plugins info grix-admin --json`; only include the minimal plugin commands still needed.
6. Use `scripts/grix_auth.py configure@dhf-openclaw ...` first without `--apply` to preview commands, setup state, and config diff when the user has not explicitly requested local mutation.
7. Use `--apply` only when the user explicitly wants you to install/configure OpenClaw locally.
8. Follow the plugin package instructions:
   - `openclaw plugins install @dhf-openclaw/grix`
   - `openclaw plugins enable grix`
   - `openclaw plugins install @dhf-openclaw/grix-admin`
   - `openclaw plugins enable grix-admin`
   - `openclaw onboard` can also consume `wsUrl`, `agentId`, and `apiKey`
   - channel config follows the README direct-config alternative for the main agent
   - exec approval config follows the README `Exec Approvals` section when the user wants approvals in Grix chat
   - only place approver ids under `channels.grix.execApprovals` or `channels.grix.accounts.<accountId>.execApprovals`
   - never invent unsupported keys such as `approvals.exec.timeoutMs` or `approvals.exec.approvers`
   - tools config must include:

```json
{
  "tools": {
    "profile": "coding",
    "alsoAllow": [
      "message",
      "grix_group",
      "grix_agent_admin"
    ],
    "sessions": {
      "visibility": "agent"
    }
  }
}
```

   - `openclaw gateway restart`

### C. Inspect local OpenClaw readiness

Use:

```bash
scripts/grix_auth.py inspect@dhf-openclaw
```

This action:

1. checks whether the `grix` plugin is detected and loaded
2. checks whether base `channels.grix` is present and internally consistent
3. checks whether `grix-admin` is detected and loaded
4. checks whether `tools.profile`, `tools.alsoAllow`, and `tools.sessions.visibility` match the required group-governance settings
5. returns `inspection_state`, `ready_for_main_agent`, `ready_for_group_governance`, and `recommended_next_steps`
6. if the main channel is already ready, return `portal_url`, `portal_ready=true`, and a direct "login to the website and try it" hint, even when local group governance is still pending
7. never mutates local OpenClaw state

### D. One-shot bootstrap

Use:

```bash
scripts/grix_auth.py bootstrap@dhf-openclaw ...
```

This action can:

1. use a provided `access_token`
2. reuse-or-create the API agent
3. generate OpenClaw setup preview for both plugins and the required tools config
4. apply OpenClaw setup when `--apply` is present
5. expose `bootstrap_state`, `channel_credentials`, `onboard_values`, environment variables, and required tools config that the next agent step can consume directly

## Guardrails

1. Do not invent tokens, agent IDs, or API keys.
2. Treat `create-api-agent`, key rotation on reused agents, and `configure@dhf-openclaw --apply` as side-effecting operations.
3. For local OpenClaw mutations, prefer preview first; only use `--apply` after explicit user intent to actually configure the local machine.
4. Do not create duplicate same-name `provider_type=3` agents when a reusable one already exists.
5. Keep API key output exact when the user asks for it.
6. `provider_type` for created or reused Grix agent must be `3`.
7. When configuring the main agent, prefer updating base `channels.grix` over inventing extra accounts.
8. Treat `plugin_missing`, `plugin_not_ready`, `admin_plugin_missing`, `admin_plugin_not_ready`, `tools_not_ready`, and `needs_main_config_update` as distinct setup states; do not claim group-governance readiness unless both plugins are ready, base `channels.grix` matches the target, and the required tools block is active.
9. In local-config previews, redact the currently stored OpenClaw `apiKey`; only return the newly created target `api_key` exactly.
10. If `inspect@dhf-openclaw` says the main agent is already configured and the user did not ask for a different agent target, stop instead of continuing into setup mutation.

## Script Contract

Script: `scripts/grix_auth.py`

Actions:

1. `create-api-agent`
2. `inspect@dhf-openclaw`
3. `configure@dhf-openclaw`
4. `bootstrap@dhf-openclaw`

Success shape highlights:

1. `create-api-agent` returns top-level `agent_id`, `api_endpoint`, `api_key`, `api_key_hint`, and whether the agent was reused or newly created
2. `inspect@dhf-openclaw`, `configure@dhf-openclaw`, and `bootstrap@dhf-openclaw` can return `portal_url`, `portal_ready`, and `portal_hint`
3. `inspect@dhf-openclaw`, `configure@dhf-openclaw`, and `bootstrap@dhf-openclaw` also return `grix_intro`, `grix_highlights`, and `user_reply_templates` so the agent can explain the concept to the user consistently
4. `create-api-agent` returns the `provider_type=3` agent data
5. `inspect@dhf-openclaw` returns `inspection_state`, `plugin_status`, `admin_plugin_status`, redacted current main grix config, current tools config, channel consistency checks, tools checks, readiness booleans, and `recommended_next_steps`
6. `configure@dhf-openclaw` returns `setup_state`, `plugin_status`, `admin_plugin_status`, current and next main grix config, current and next tools config, minimal plugin commands, `onboard_values`, environment variables, required tools config, and `command_results` when `--apply` is used
7. `bootstrap@dhf-openclaw` returns nested `created_agent`, `openclaw_setup`, top-level `channel_credentials`, and `bootstrap_state`

## References

1. Read [references/api-contract.md](references/api-contract.md) for API-agent creation routes.
2. Read [references/openclaw-setup.md](references/openclaw-setup.md) for the `@dhf-openclaw/grix` + `@dhf-openclaw/grix-admin` setup flow.
3. Read [references/grix-concepts.md](references/grix-concepts.md) when the user needs a clear product/concept explanation.
4. Read [references/user-replies.md](references/user-replies.md) when the user needs short, direct pitch or status replies.
