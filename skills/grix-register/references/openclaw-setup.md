# OpenClaw Setup

This flow follows the current `@dhf-openclaw/grix` and `@dhf-openclaw/grix-admin` package README expectations.

## Package

1. Plugin package: `@dhf-openclaw/grix`
2. Admin package: `@dhf-openclaw/grix-admin`
3. Purpose: Grix channel transport plus typed group-governance capability for OpenClaw

## Install and Enable

```bash
openclaw plugins install @dhf-openclaw/grix
openclaw plugins enable grix
openclaw plugins install @dhf-openclaw/grix-admin
openclaw plugins enable grix-admin
openclaw gateway restart
```

## Plugin Inspection

```bash
openclaw plugins info grix --json
openclaw plugins info grix-admin --json
```

Use this to inspect whether both plugins are already present and loaded before planning local mutations.

## Onboard Wizard

Choose `Grix` in `openclaw onboard` channel setup and enter:

1. `wsUrl`
2. `agentId`
3. `apiKey`

## Channel Setup Command

```bash
openclaw channels add \
  --channel grix \
  --name grix-main \
  --http-url 'wss://grix.dhf.pub/v1/agent-api/ws?agent_id=<YOUR_AGENT_ID>' \
  --user-id '<YOUR_AGENT_ID>' \
  --token '<YOUR_API_KEY>'
```

## Direct Config Alternative

```json
{
  "channels": {
    "grix": {
      "enabled": true,
      "wsUrl": "wss://grix.dhf.pub/v1/agent-api/ws?agent_id=<YOUR_AGENT_ID>",
      "agentId": "<YOUR_AGENT_ID>",
      "apiKey": "<YOUR_API_KEY>"
    }
  },
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

## Environment Variables

```bash
export GRIX_WS_URL='wss://grix.dhf.pub/v1/agent-api/ws?agent_id=<YOUR_AGENT_ID>'
export GRIX_AGENT_ID='<YOUR_AGENT_ID>'
export GRIX_API_KEY='<YOUR_API_KEY>'
```

## Practical Rules

1. Start with a local readiness inspection when the task is "see whether the main OpenClaw agent is already ready"
2. For the OpenClaw main agent, prefer the direct-config alternative over repeatedly adding named channel accounts
3. Default channel name for preview commands: `grix-main`
4. Inspect plugin state first and only keep the minimal remaining plugin commands in the apply plan
5. Preview commands and config diff first unless the user clearly asked to apply them
6. Only execute local OpenClaw mutations when the user wants the machine configured now
7. After config update, restart the gateway
8. Preserve other existing `channels.grix` fields such as `accounts`, `streamChunkChars`, `streamChunkDelayMs`, and `reconnectMs`
9. Preserve unrelated existing `tools.alsoAllow` entries, but ensure `message`, `grix_group`, and `grix_agent_admin` are present and `tools.sessions.visibility=agent`
10. Return `onboard_values` and `GRIX_*` environment variables together with the direct-config preview so downstream agents can reuse the same credentials without recomputing them
11. If the main channel is already healthy, or setup has just been applied successfully, tell the user they can log in to `https://grix.dhf.pub/` directly to experience it
12. Do not claim local group-governance readiness unless both plugins are loaded and the required tools block is active

## Exec Approval Setup

Grix chat exec approvals only require `@dhf-openclaw/grix`. They do not require `@dhf-openclaw/grix-admin`.

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
    "grix": {
      "execApprovals": {
        "enabled": true,
        "approvers": ["<GRIX_SENDER_ID>"]
      }
    }
  }
}
```

If the deployment uses a named Grix account, move the approver config to `channels.grix.accounts.<accountId>.execApprovals`.

Rules:

1. `approvals.exec` currently supports only `enabled` and `mode`
2. Do not add `approvals.exec.timeoutMs`
3. Do not add `approvals.exec.approvers`
4. Put approver ids only under `channels.grix.execApprovals` or `channels.grix.accounts.<accountId>.execApprovals`
5. `approvers` must be Grix sender ids, not OpenClaw agent ids
6. After config changes, run `openclaw gateway restart`

Verification:

```bash
openclaw plugins info grix --json
openclaw config get approvals.exec --json
openclaw config get channels.grix --json
```

Expected result:

1. `plugins info grix` shows `status=loaded`
2. `approvals.exec` is `enabled=true` and `mode=session`
3. the active Grix account shows `execApprovals.enabled=true`
4. the active Grix account contains at least one sender id in `execApprovals.approvers`
