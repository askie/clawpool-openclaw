# OpenClaw Grix Channel Plugin

This plugin connects OpenClaw to [https://grix.dhf.pub/](https://grix.dhf.pub/) so OpenClaw can be managed on that website, with mobile PWA page support.

Compatibility:

- Requires `OpenClaw >= 2026.3.13`

Its runtime remains focused on channel responsibilities:

- connect to Grix over the Agent API WebSocket
- receive inbound messages
- send replies, media, and streaming chunks
- support native channel actions such as `unsend` / `delete`

The npm package also bundles OpenClaw skills for first-time setup and native channel actions, so users can install the plugin and complete Grix onboarding directly in conversation.

For full group-governance and API-agent admin capability, OpenClaw also needs the separate typed admin plugin:

- `@dhf-openclaw/grix-admin`

If you are reading the admin plugin documentation first, also read the companion Grix admin plugin README.

## Which Package Do I Need?

- Install only `@dhf-openclaw/grix` when you only need Grix channel transport and the bundled onboarding skill
- Install both `@dhf-openclaw/grix` and `@dhf-openclaw/grix-admin` when you want OpenClaw agents to use typed group governance or API-agent admin tools
- Never install only `@dhf-openclaw/grix-admin` without configuring `@dhf-openclaw/grix` first, because the admin plugin reads credentials from `channels.grix`

## Install

Before install, confirm your local OpenClaw version is greater than or equal to `2026.3.13`.

### Base Channel Transport

```bash
openclaw plugins install @dhf-openclaw/grix
openclaw plugins enable grix
openclaw gateway restart
```

### Local Source Checkout

If you load this plugin directly from a local checkout instead of the published npm package, install repo dependencies first so `openclaw/plugin-sdk` can resolve from this workspace:

```bash
npm install
```

Then point OpenClaw at the tracked local entry file:

```bash
openclaw plugins install ./grix.ts
```

### Full Grix Capability

For native group-management capability inside OpenClaw, also install the admin plugin and enable the required tools:

```bash
openclaw plugins install @dhf-openclaw/grix-admin
openclaw plugins enable grix-admin
openclaw gateway restart
```

Recommended order:

1. Install and configure `@dhf-openclaw/grix`
2. Confirm `channels.grix` is healthy
3. Install and enable `@dhf-openclaw/grix-admin`
4. Enable the required `tools` block
5. Restart the OpenClaw gateway

If you need the detailed admin-side requirements, see the companion Grix admin plugin README.

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

After install, OpenClaw can surface these bundled skills from this plugin:

- `grix-auth-access`: inspect current readiness, guide website registration/login, create or reuse `provider_type=3` API agents, install or enable `@dhf-openclaw/grix-admin`, and configure the main `channels.grix` path plus required tools
- `egg-install`: handle Shrimp Pond egg install chats, confirm targets with the user in the current private conversation, execute persona.zip or skill.zip installation with正规步骤, and report progress or failures in normal dialogue
- `message-send`: send current-session or cross-session Grix messages
- `message-unsend`: unsend previously sent Grix messages

You can confirm the bundled skill is visible with:

```bash
openclaw skills list
openclaw skills info grix-auth-access
```

If the local main channel is already ready, `grix-auth-access` tells the user to log in to [https://grix.dhf.pub/](https://grix.dhf.pub/) directly. If group-governance prerequisites are still missing, the skill can continue by installing `@dhf-openclaw/grix-admin` and enabling the required tools block in chat.

## Configure

### `openclaw onboard`

Choose `Grix` in channel setup and enter:

- `wsUrl`
- `agentId`
- `apiKey`

### `openclaw channels add`

```bash
openclaw channels add \
  --channel grix \
  --name grix-main \
  --http-url 'wss://grix.dhf.pub/v1/agent-api/ws?agent_id=<YOUR_AGENT_ID>' \
  --user-id '<YOUR_AGENT_ID>' \
  --token '<YOUR_API_KEY>'
```

### Direct config

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

The `channels.grix` section is the dependency that `@dhf-openclaw/grix-admin` reads when it calls the Grix Agent API.

## Exec Approvals

Grix can approve OpenClaw host `exec` requests in chat.

`exec` approvals only require `@dhf-openclaw/grix`. They do not require `@dhf-openclaw/grix-admin`.

### 1. Configure Grix approvers

Add the Grix sender ids that are allowed to approve:

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

If you use a named Grix account, configure approvers under that account:

```json
{
  "channels": {
    "grix": {
      "accounts": {
        "xiami": {
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

Mode selection:

- `session`: send the approval prompt back to the current Grix chat
- `targets`: send the approval prompt to the explicit targets configured in `approvals.exec.targets`
- `both`: send to the current chat and to explicit targets

If needed, you can also use OpenClaw's upstream `approvals.exec` fields such as `agentFilter`, `sessionFilter`, and `targets`.

### 3. Restart the gateway

After changing any approval-related config:

```bash
openclaw gateway restart
```

### 4. Approve in chat

Usage flow:

1. Ask OpenClaw to run an `exec` command that requires approval.
2. OpenClaw sends the approval prompt to Grix according to `approvals.exec.mode`.
3. An allowed approver can:
   - click `Allow Once`, `Allow Always`, or `Deny`
   - or send `/approve <id> allow-once|allow-always|deny`
4. OpenClaw continues or denies the `exec` request based on that decision.

Notes:

- `approvers` must be Grix sender ids, not OpenClaw agent ids
- put approvers under the Grix account that is actually serving the session
- approval requests and approval results are shown in chat
- some OpenClaw lifecycle notices may still appear as normal text

### 5. Quick checks

```bash
openclaw plugins info grix --json
openclaw config get approvals.exec --json
openclaw config get channels.grix --json
```

Check that:

- `plugins info grix` reports `status = "loaded"`
- `approvals.exec.enabled = true`
- `approvals.exec.mode` matches your intended delivery path
- the active Grix account has `execApprovals.enabled = true`
- the active Grix account has at least one sender id in `execApprovals.approvers`

Troubleshooting:

- if no approval card appears in the current chat, first confirm `tools.exec.ask = "always"` and `approvals.exec.mode = "session"`
- if you are forwarding to explicit Grix targets, confirm `approvals.exec.targets` points to the correct `channel = "grix"` target
- if the chat shows approval text but approvers cannot operate it, check that `approvers` contains the human Grix sender id
- if `openclaw gateway restart` fails config validation, remove invalid keys under `approvals.exec` and keep approver ids only under `channels.grix.*.execApprovals`

For an end-to-end verification checklist, see:

- [docs/openclaw_exec_approval_e2e.md](../../docs/openclaw_exec_approval_e2e.md)

For multi-account setups, put `execApprovals` under `channels.grix.accounts.<accountId>`.

## Native Channel Actions

The channel plugin exposes only channel-native message actions:

- `unsend`
- `delete`

## Bundled Onboarding Skill

Grix fully adapts the OpenClaw communication protocol, so OpenClaw interaction and Grix agent communication are directly connected. The bundled `grix-auth-access` skill is intended to explain that model to the user and complete the onboarding path:

1. inspect whether the local OpenClaw main agent is already configured
2. if the main channel is already configured, tell the user they can log in to [https://grix.dhf.pub/](https://grix.dhf.pub/) immediately
3. otherwise guide registration or login
4. create or reuse a `provider_type=3` API agent
5. install or enable `@dhf-openclaw/grix-admin` when group-governance capability is requested
6. configure the OpenClaw main `channels.grix` entry and required tools block

This gives users a direct “install plugin, enable it, then finish setup in conversation” path. For full multi-agent groups, private chat, and group governance inside OpenClaw, the final local state must include both plugins plus the required tools block.

## Environment Variables

- `GRIX_WS_URL`
- `GRIX_AGENT_ID`
- `GRIX_API_KEY`
