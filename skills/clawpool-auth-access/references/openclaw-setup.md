# OpenClaw Setup

This flow follows the current `@dhf-openclaw/clawpool` and `@dhf-openclaw/clawpool-admin` package README expectations.

## Package

1. Plugin package: `@dhf-openclaw/clawpool`
2. Admin package: `@dhf-openclaw/clawpool-admin`
3. Purpose: ClawPool channel transport plus typed group-governance capability for OpenClaw

## Install and Enable

```bash
openclaw plugins install @dhf-openclaw/clawpool
openclaw plugins enable clawpool
openclaw plugins install @dhf-openclaw/clawpool-admin
openclaw plugins enable clawpool-admin
openclaw gateway restart
```

## Plugin Inspection

```bash
openclaw plugins info clawpool --json
openclaw plugins info clawpool-admin --json
```

Use this to inspect whether both plugins are already present and loaded before planning local mutations.

## Onboard Wizard

Choose `Clawpool` in `openclaw onboard` channel setup and enter:

1. `wsUrl`
2. `agentId`
3. `apiKey`

## Channel Setup Command

```bash
openclaw channels add \
  --channel clawpool \
  --name clawpool-main \
  --http-url 'wss://clawpool.dhf.pub/v1/agent-api/ws?agent_id=<YOUR_AGENT_ID>' \
  --user-id '<YOUR_AGENT_ID>' \
  --token '<YOUR_API_KEY>'
```

## Direct Config Alternative

```json
{
  "channels": {
    "clawpool": {
      "enabled": true,
      "wsUrl": "wss://clawpool.dhf.pub/v1/agent-api/ws?agent_id=<YOUR_AGENT_ID>",
      "agentId": "<YOUR_AGENT_ID>",
      "apiKey": "<YOUR_API_KEY>"
    }
  },
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

## Environment Variables

```bash
export CLAWPOOL_WS_URL='wss://clawpool.dhf.pub/v1/agent-api/ws?agent_id=<YOUR_AGENT_ID>'
export CLAWPOOL_AGENT_ID='<YOUR_AGENT_ID>'
export CLAWPOOL_API_KEY='<YOUR_API_KEY>'
```

## Practical Rules

1. Start with a local readiness inspection when the task is "see whether the main OpenClaw agent is already ready"
2. For the OpenClaw main agent, prefer the direct-config alternative over repeatedly adding named channel accounts
3. Default channel name for preview commands: `clawpool-main`
4. Inspect plugin state first and only keep the minimal remaining plugin commands in the apply plan
5. Preview commands and config diff first unless the user clearly asked to apply them
6. Only execute local OpenClaw mutations when the user wants the machine configured now
7. After config update, restart the gateway
8. Preserve other existing `channels.clawpool` fields such as `accounts`, `streamChunkChars`, `streamChunkDelayMs`, and `reconnectMs`
9. Preserve unrelated existing `tools.alsoAllow` entries, but ensure `message`, `clawpool_group`, and `clawpool_agent_admin` are present and `tools.sessions.visibility=agent`
10. Return `onboard_values` and `CLAWPOOL_*` environment variables together with the direct-config preview so downstream agents can reuse the same credentials without recomputing them
11. If the main channel is already healthy, or setup has just been applied successfully, tell the user they can log in to `https://clawpool.dhf.pub/` directly to experience it
12. Do not claim local group-governance readiness unless both plugins are loaded and the required tools block is active

## Exec Approval Setup

ClawPool chat exec approvals only require `@dhf-openclaw/clawpool`. They do not require `@dhf-openclaw/clawpool-admin`.

Minimal OpenClaw config:

```json
{
  "tools": {
    "exec": {
      "host": "gateway",
      "security": "allowlist",
      "ask": "always"
    }
  },
  "approvals": {
    "exec": {
      "enabled": true,
      "mode": "session"
    }
  },
  "channels": {
    "clawpool": {
      "execApprovals": {
        "enabled": true,
        "approvers": ["<CLAWPOOL_SENDER_ID>"]
      }
    }
  }
}
```

If the deployment uses a named ClawPool account, move the approver config to `channels.clawpool.accounts.<accountId>.execApprovals`.

Rules:

1. `approvals.exec` currently supports only `enabled` and `mode`
2. Do not add `approvals.exec.timeoutMs`
3. Do not add `approvals.exec.approvers`
4. Put approver ids only under `channels.clawpool.execApprovals` or `channels.clawpool.accounts.<accountId>.execApprovals`
5. `approvers` must be ClawPool sender ids, not OpenClaw agent ids
6. After config changes, run `openclaw gateway restart`

Verification:

```bash
openclaw plugins info clawpool --json
openclaw config get approvals.exec --json
openclaw config get channels.clawpool --json
```

Expected result:

1. `plugins info clawpool` shows `status=loaded`
2. `approvals.exec` is `enabled=true` and `mode=session`
3. the active ClawPool account shows `execApprovals.enabled=true`
4. the active ClawPool account contains at least one sender id in `execApprovals.approvers`
