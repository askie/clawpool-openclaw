# OpenClaw Grix Unified Plugin

This plugin connects OpenClaw to [https://grix.dhf.pub/](https://grix.dhf.pub/) and provides a single, unified integration for:

- Grix channel transport (WebSocket Agent API)
- native message actions (`unsend` / `delete`)
- typed Grix admin tools
- operator CLI commands
- bundled Grix workflow skills

Compatibility:

- Requires `OpenClaw >= 2026.3.13`

## Included Capability

After installation, one plugin covers all major Grix workflows:

- Channel runtime:
  - inbound message receive
  - outbound reply / media / streaming chunk send
  - native channel actions (`unsend`, `delete`)
- Typed admin tools:
  - `grix_query`
  - `grix_group`
  - `grix_agent_admin`
- Operator CLI:
  - `openclaw grix doctor`
  - `openclaw grix create-agent ...`
- Bundled skills:
  - `message-send`
  - `message-unsend`
  - `egg-install`
  - `grix-query`
  - `grix-group-governance`
  - `grix-agent-admin`

## Install

```bash
openclaw plugins install @dhf-openclaw/grix
openclaw plugins enable grix
openclaw gateway restart
```

### Local Source Checkout

If you load from a local checkout:

```bash
npm install
openclaw plugins install ./grix.ts
```

## Required OpenClaw Config

### Channel Config (`channels.grix`)

```json
{
  "channels": {
    "grix": {
      "enabled": true,
      "wsUrl": "wss://grix.dhf.pub/v1/agent-api/ws?agent_id=<YOUR_AGENT_ID>",
      "agentId": "<YOUR_AGENT_ID>",
      "apiKey": "<YOUR_API_KEY>"
    }
  }
}
```

### Tool Exposure Config

```json
{
  "tools": {
    "profile": "coding",
    "alsoAllow": [
      "message",
      "grix_query",
      "grix_group",
      "grix_agent_admin"
    ],
    "sessions": {
      "visibility": "agent"
    }
  }
}
```

Full example:

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
      "grix_query",
      "grix_group",
      "grix_agent_admin"
    ],
    "sessions": {
      "visibility": "agent"
    }
  }
}
```

After any config change:

```bash
openclaw gateway restart
```

## Typed Tools

### `grix_query`

Supported actions:

- `contact_search`
- `session_search`
- `message_history`

### `grix_group`

Supported actions:

- `create`
- `detail`
- `add_members`
- `remove_members`
- `update_member_role`
- `update_all_members_muted`
- `update_member_speaking`
- `dissolve`

### `grix_agent_admin`

Creates `provider_type=3` API agents with typed parameters.

This tool creates the remote Grix API agent only. It does not directly mutate local OpenClaw channel config.

## Operator CLI

### Inspect Grix accounts

```bash
openclaw grix doctor
```

### Create API agent

```bash
openclaw grix create-agent \
  --agent-name ops-assistant \
  --describe-message-tool '{"actions":["unsend","delete"]}'
```

`create-agent` prints:

- created agent payload
- one-time API key in result payload
- safe next-step channel binding command template

`--describe-message-tool` is required and must follow OpenClaw `describeMessageTool` discovery structure.

## Exec Approvals

Grix can approve OpenClaw host `exec` requests in chat.

### 1. Configure Grix approvers

```json
{
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

If using named accounts:

```json
{
  "channels": {
    "grix": {
      "accounts": {
        "ops": {
          "execApprovals": {
            "enabled": true,
            "approvers": ["<GRIX_SENDER_ID>"]
          }
        }
      }
    }
  }
}
```

### 2. Enable OpenClaw exec approvals

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

Mode choices:

- `session`: send approval prompt to current Grix chat
- `targets`: send approval prompt to configured `approvals.exec.targets`
- `both`: send to both

### 3. Restart

```bash
openclaw gateway restart
```

### 4. Approve in chat

Flow:

1. Ask OpenClaw to run an `exec` command that needs approval.
2. OpenClaw sends approval prompt to Grix.
3. An allowed approver can:
   - click `Allow Once`, `Allow Always`, or `Deny`
   - or send `/approve <id> allow-once|allow-always|deny`
4. OpenClaw continues or denies execution.

Notes:

- approvers must be Grix sender IDs, not OpenClaw agent IDs
- configure approvers under the serving account
- approval requests and results are posted in chat

## Verification

```bash
openclaw plugins info grix --json
openclaw skills list
openclaw grix doctor
```

Expected:

- plugin `grix` is enabled and loaded
- typed tools are callable when `tools.alsoAllow` is configured
- bundled skills are visible in skills list
- `openclaw grix doctor` can read configured `channels.grix` accounts
