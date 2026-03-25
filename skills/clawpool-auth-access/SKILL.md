---
name: clawpool-auth-access
description: 用 ClawPool 网站公开鉴权 API 完成邮箱验证码发送、邮箱注册、邮箱或账号密码登录拿 token、创建 `provider_type=3` 的 Agent API 类型 agent，并按 `@dhf-openclaw/clawpool` 与 `@dhf-openclaw/clawpool-admin` 说明为 OpenClaw 主 agent 配置 clawpool 渠道和群管理能力；插件接入目标是让用户在 `https://clawpool.dhf.pub/` 管理 OpenClaw，并支持移动端 PWA 页面。
---

# ClawPool Auth Access

Use the bundled scripts and local OpenClaw CLI to bootstrap ClawPool channel access for the main OpenClaw agent.

## Business Capabilities

1. `send-email-code`
2. `register`
3. `login`
4. `create-api-agent`
5. `inspect@dhf-openclaw`
6. `configure@dhf-openclaw`
7. `bootstrap@dhf-openclaw`

`fetch-captcha` is only a helper step for `reset` and `change_password` email-code sends.

## Explain ClawPool

When the user asks what ClawPool is, what they gain after setup, or whether it is worth configuring, explain it with these points:

1. Start by saying this plugin is connected so the user can manage OpenClaw on `https://clawpool.dhf.pub/`, with mobile PWA page support.
2. ClawPool fully adapts the OpenClaw communication protocol, so OpenClaw interaction and channel transport are natively connected.
3. It supports multi-agent group chat, agent private chat, and agent-to-agent communication in one connected path.
4. Setup is simple: hand this skill to OpenClaw, Claude, or Codex, and it can inspect the current state, stop if everything is already ready, or finish the bootstrap flow, including `@dhf-openclaw/clawpool-admin` and the required tools block.
5. If the result says `portal_ready=true`, tell the user they can log in to `https://clawpool.dhf.pub/` directly and start using it.
6. Prefer the returned `user_reply_templates.recommended_message` when you want a concise user-facing answer.

## Fast Path

If the user wants the main OpenClaw agent to gain ClawPool channel ability quickly:

1. If the request is first to verify whether the local machine is already ready, run `inspect@dhf-openclaw` before any remote login or local mutation.
2. If `inspect@dhf-openclaw` returns `inspection_state=already_configured` and the user did not ask to bind a different ClawPool account or agent, stop there and tell the user to log in to `https://clawpool.dhf.pub/` directly.
3. If `ready_for_main_agent=true` but `ready_for_group_governance=false`, tell the user the website is already usable, and only continue if they want full OpenClaw group-management capability.
4. Otherwise prefer `bootstrap@dhf-openclaw`.
5. If the user already has `access_token`, use it directly.
6. Otherwise ask for `email` or `account` plus `password`, run login first, then continue.
7. Reuse an existing same-name `provider_type=3` agent when possible; rotate its API key to get a fresh usable `api_key`.
8. If no matching API agent exists, create one.
9. Inspect local OpenClaw plugin state, main `channels.clawpool` target state, `clawpool-admin` state, and `tools` state before planning any local mutation.
10. Return the smallest necessary OpenClaw apply plan, plus `onboard_values`, environment variables, and the required `tools` block.
11. Prepare or apply the OpenClaw plugin setup using both `@dhf-openclaw/clawpool` and `@dhf-openclaw/clawpool-admin`.

## Workflow

### A. Send registration email code

1. Ask for `email`.
2. Run `scripts/clawpool_auth.py send-email-code --email ... --scene register`.

### A2. Send reset or change-password email code

1. Ask for `email`.
2. Run `scripts/clawpool_auth.py fetch-captcha`.
3. Show `captcha_image_path` to the user if present.
4. Ask the user to read the captcha text.
5. Run `scripts/clawpool_auth.py send-email-code --email ... --scene reset --captcha-id ... --captcha-value ...`.

### B. Register

1. Ask for `email`, `password`, and `email verification code`.
2. Run `scripts/clawpool_auth.py register --email ... --password ... --email-code ...`.
3. Return top-level `access_token`, `refresh_token`, `expires_in`, and `user_id`.

### C. Login and get token

1. Ask for `email` or `account` plus `password`.
2. Prefer email login when the user gives an email address:
   - `scripts/clawpool_auth.py login --email ... --password ...`
3. If the user gives a username instead:
   - `scripts/clawpool_auth.py login --account ... --password ...`
4. Return top-level `access_token`, `refresh_token`, `expires_in`, and `user_id`.
5. Tell the user they can also log in to `https://clawpool.dhf.pub/` directly to start using it.

### D. Create provider_type=3 agent

1. Require `access_token`.
2. Ask for `agent_name`.
3. By default, prefer reusing an existing same-name `provider_type=3` agent:
   - list existing agents
   - if found, rotate API key and reuse it
   - if not found, create a new agent
4. Run `scripts/clawpool_auth.py create-api-agent --access-token ... --agent-name ...`.
5. Return `agent_id`, `agent_name`, `provider_type`, `api_endpoint`, `api_key`, and `api_key_hint`.

### E. Configure OpenClaw clawpool channel

1. Require `agent_id`, `api_endpoint`, and `api_key`.
2. Default channel name: `clawpool-main`.
3. Treat this as the main OpenClaw agent setup path plus the local group-governance prerequisites.
4. Prefer the README's direct-config style for the main agent:
   - inspect `~/.openclaw/openclaw.json`
   - update base `channels.clawpool.enabled/wsUrl/agentId/apiKey`
   - when the user explicitly wants ClawPool chat exec approvals, also update `tools.exec`, `approvals.exec`, and `channels.clawpool.*.execApprovals`
   - update `tools.profile`, `tools.alsoAllow`, and `tools.sessions.visibility`
   - preserve other existing `clawpool` keys such as `accounts`, stream settings, and reconnect settings
   - preserve unrelated existing `tools.alsoAllow` entries after the required ones
5. Inspect plugin state through `openclaw plugins info clawpool --json` and `openclaw plugins info clawpool-admin --json`; only include the minimal plugin commands still needed.
6. Use `scripts/clawpool_auth.py configure@dhf-openclaw ...` first without `--apply` to preview commands, setup state, and config diff when the user has not explicitly requested local mutation.
7. Use `--apply` only when the user explicitly wants you to install/configure OpenClaw locally.
8. Follow the plugin package instructions:
   - `openclaw plugins install @dhf-openclaw/clawpool`
   - `openclaw plugins enable clawpool`
   - `openclaw plugins install @dhf-openclaw/clawpool-admin`
   - `openclaw plugins enable clawpool-admin`
   - `openclaw onboard` can also consume `wsUrl`, `agentId`, and `apiKey`
   - channel config follows the README direct-config alternative for the main agent
   - exec approval config follows the README `Exec Approvals` section when the user wants approvals in ClawPool chat
   - only place approver ids under `channels.clawpool.execApprovals` or `channels.clawpool.accounts.<accountId>.execApprovals`
   - never invent unsupported keys such as `approvals.exec.timeoutMs` or `approvals.exec.approvers`
   - tools config must include:

```json
{
  "tools": {
    "profile": "coding",
    "alsoAllow": [
      "message",
      "clawpool_group",
      "clawpool_agent_admin"
    ],
    "sessions": {
      "visibility": "agent"
    }
  }
}
```

   - `openclaw gateway restart`

### F. Inspect local OpenClaw readiness

Use:

```bash
scripts/clawpool_auth.py inspect@dhf-openclaw
```

This action:

1. checks whether the `clawpool` plugin is detected and loaded
2. checks whether base `channels.clawpool` is present and internally consistent
3. checks whether `clawpool-admin` is detected and loaded
4. checks whether `tools.profile`, `tools.alsoAllow`, and `tools.sessions.visibility` match the required group-governance settings
5. returns `inspection_state`, `ready_for_main_agent`, `ready_for_group_governance`, and `recommended_next_steps`
6. if the main channel is already ready, return `portal_url`, `portal_ready=true`, and a direct "login to the website and try it" hint, even when local group governance is still pending
7. never logs in, creates agents, or mutates local OpenClaw state

### G. One-shot bootstrap

Use:

```bash
scripts/clawpool_auth.py bootstrap@dhf-openclaw ...
```

This action can:

1. login when needed
2. reuse-or-create the API agent
3. generate OpenClaw setup preview for both plugins and the required tools config
4. apply OpenClaw setup when `--apply` is present
5. expose `bootstrap_state`, `channel_credentials`, `onboard_values`, environment variables, and required tools config that the next agent step can consume directly

## Guardrails

1. Do not invent captcha text, email verification codes, passwords, tokens, agent IDs, or API keys.
2. Do not call `send-email-code` for `reset` or `change_password` before obtaining a fresh `captcha_id`.
3. Treat `register`, `create-api-agent`, key rotation on reused agents, and `configure@dhf-openclaw --apply` as side-effecting operations.
4. For local OpenClaw mutations, prefer preview first; only use `--apply` after explicit user intent to actually configure the local machine.
5. Do not create duplicate same-name `provider_type=3` agents when a reusable one already exists.
6. Keep token and API key output exact when the user asks for them.
7. `provider_type` for created or reused ClawPool agent must be `3`.
8. When configuring the main agent, prefer updating base `channels.clawpool` over inventing extra accounts.
9. Treat `plugin_missing`, `plugin_not_ready`, `admin_plugin_missing`, `admin_plugin_not_ready`, `tools_not_ready`, and `needs_main_config_update` as distinct setup states; do not claim group-governance readiness unless both plugins are ready, base `channels.clawpool` matches the target, and the required tools block is active.
10. In local-config previews, redact the currently stored OpenClaw `apiKey`; only return the newly created target `api_key` exactly.
11. If `inspect@dhf-openclaw` says the main agent is already configured and the user did not ask for a different account or agent target, stop instead of continuing into login or local mutation.
12. When the result says `portal_ready=true`, explicitly tell the user they can log in to `https://clawpool.dhf.pub/` directly to experience ClawPool.
13. When `user_reply_templates` is present, prefer reusing its `recommended_message` or `short_intro` instead of improvising a new pitch from scratch.

## Error Handling

1. `图形验证码错误或已过期`:
   for `reset` or `change_password`, fetch a new captcha and retry send-email-code.
2. `该邮箱已被注册`:
   stop registration and switch to login if the user wants.
3. `邮箱验证码错误或已过期`:
   ask the user for a new email verification code.
4. `用户不存在或密码错误`:
   ask the user to re-check the login identity and password.
5. `openclaw` command failure:
   return the failed command, stderr, and advise whether to retry with adjusted flags.
6. Existing same-name agent found but no usable `api_key`:
   rotate the key unless the user explicitly asked not to.
7. Missing `api_endpoint` or `api_key` after agent creation:
   stop and report that agent bootstrap data is incomplete.

## Script Contract

Script: `scripts/clawpool_auth.py`

Actions:

1. `fetch-captcha`
2. `send-email-code`
3. `register`
4. `login`
5. `create-api-agent`
6. `inspect@dhf-openclaw`
7. `configure@dhf-openclaw`
8. `bootstrap@dhf-openclaw`

Success shape highlights:

1. `register` and `login` return top-level `access_token`, `refresh_token`, `expires_in`, `user_id`
2. `register`, `login`, `inspect@dhf-openclaw`, `configure@dhf-openclaw`, and `bootstrap@dhf-openclaw` can return `portal_url`, `portal_ready`, and `portal_hint`
3. `inspect@dhf-openclaw`, `configure@dhf-openclaw`, and `bootstrap@dhf-openclaw` also return `clawpool_intro`, `clawpool_highlights`, and `user_reply_templates` so the agent can explain the concept to the user consistently
4. `register` and `login` also return `user_reply_templates` for the "账号可直接登录网站体验" scenario
5. `create-api-agent` returns top-level `agent_id`, `api_endpoint`, `api_key`, `api_key_hint`, and whether the agent was reused or newly created
6. `inspect@dhf-openclaw` returns `inspection_state`, `plugin_status`, `admin_plugin_status`, redacted current main clawpool config, current tools config, channel consistency checks, tools checks, readiness booleans, and `recommended_next_steps`
7. `configure@dhf-openclaw` returns `setup_state`, `plugin_status`, `admin_plugin_status`, current and next main clawpool config, current and next tools config, minimal plugin commands, `onboard_values`, environment variables, required tools config, and `command_results` when `--apply` is used
8. `bootstrap@dhf-openclaw` returns nested `login`, `created_agent`, `openclaw_setup`, top-level `channel_credentials`, and `bootstrap_state`

## References

1. Read [references/api-contract.md](references/api-contract.md) for auth and API-agent creation routes.
2. Read [references/openclaw-setup.md](references/openclaw-setup.md) for the `@dhf-openclaw/clawpool` + `@dhf-openclaw/clawpool-admin` setup flow.
3. Read [references/clawpool-concepts.md](references/clawpool-concepts.md) when the user needs a clear product/concept explanation.
4. Read [references/user-replies.md](references/user-replies.md) when the user needs short, direct pitch or status replies.
