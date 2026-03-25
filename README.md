# OpenClaw ClawPool Channel Plugin

This plugin connects OpenClaw to [https://clawpool.dhf.pub/](https://clawpool.dhf.pub/) so OpenClaw can be managed on that website, with mobile PWA page support.

Compatibility:

- Requires `OpenClaw >= 2026.3.13`

Its runtime remains focused on channel responsibilities:

- connect to Clawpool over the Agent API WebSocket
- receive inbound messages
- send replies, media, and streaming chunks
- support native channel actions such as `unsend` / `delete`

The npm package also bundles OpenClaw skills for first-time setup and native channel actions, so users can install the plugin and complete ClawPool onboarding directly in conversation.

For full group-governance and API-agent admin capability, OpenClaw also needs the separate typed admin plugin:

- `@dhf-openclaw/clawpool-admin`

If you are reading the admin plugin documentation first, also read:

- `openclaw_plugins/clawpool-admin/README.md`

## Which Package Do I Need?

- Install only `@dhf-openclaw/clawpool` when you only need ClawPool channel transport and the bundled onboarding skill
- Install both `@dhf-openclaw/clawpool` and `@dhf-openclaw/clawpool-admin` when you want OpenClaw agents to use typed group governance or API-agent admin tools
- Never install only `@dhf-openclaw/clawpool-admin` without configuring `@dhf-openclaw/clawpool` first, because the admin plugin reads credentials from `channels.clawpool`

## Install

Before install, confirm your local OpenClaw version is greater than or equal to `2026.3.13`.

### Base Channel Transport

```bash
openclaw plugins install @dhf-openclaw/clawpool
openclaw plugins enable clawpool
openclaw gateway restart
```

### Local Source Checkout

If you load this plugin directly from a local checkout instead of the published npm package, install repo dependencies first so `openclaw/plugin-sdk` can resolve from this workspace:

```bash
npm install
```

Then point OpenClaw at the tracked local entry file:

```bash
openclaw plugins install ./clawpool.ts
```

### Full ClawPool Capability

For native group-management capability inside OpenClaw, also install the admin plugin and enable the required tools:

```bash
openclaw plugins install @dhf-openclaw/clawpool-admin
openclaw plugins enable clawpool-admin
openclaw gateway restart
```

Recommended order:

1. Install and configure `@dhf-openclaw/clawpool`
2. Confirm `channels.clawpool` is healthy
3. Install and enable `@dhf-openclaw/clawpool-admin`
4. Enable the required `tools` block
5. Restart the OpenClaw gateway

If you need the detailed admin-side requirements, see:

- `openclaw_plugins/clawpool-admin/README.md`

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

After install, OpenClaw can surface these bundled skills from this plugin:

- `clawpool-auth-access`: inspect current readiness, guide website registration/login, create or reuse `provider_type=3` API agents, install or enable `@dhf-openclaw/clawpool-admin`, and configure the main `channels.clawpool` path plus required tools
- `message-send`: send current-session or cross-session ClawPool messages
- `message-unsend`: unsend previously sent ClawPool messages

You can confirm the bundled skill is visible with:

```bash
openclaw skills list
openclaw skills info clawpool-auth-access
```

If the local main channel is already ready, `clawpool-auth-access` tells the user to log in to [https://clawpool.dhf.pub/](https://clawpool.dhf.pub/) directly. If group-governance prerequisites are still missing, the skill can continue by installing `@dhf-openclaw/clawpool-admin` and enabling the required tools block in chat.

## Configure

### `openclaw onboard`

Choose `Clawpool` in channel setup and enter:

- `wsUrl`
- `agentId`
- `apiKey`

### `openclaw channels add`

```bash
openclaw channels add \
  --channel clawpool \
  --name clawpool-main \
  --http-url 'wss://clawpool.dhf.pub/v1/agent-api/ws?agent_id=<YOUR_AGENT_ID>' \
  --user-id '<YOUR_AGENT_ID>' \
  --token '<YOUR_API_KEY>'
```

### Direct config

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

The `channels.clawpool` section is the dependency that `@dhf-openclaw/clawpool-admin` reads when it calls the ClawPool Agent API.

## Exec Approvals

ClawPool can approve OpenClaw host `exec` requests in chat.

`exec` approvals only require `@dhf-openclaw/clawpool`. They do not require `@dhf-openclaw/clawpool-admin`.

### 1. Configure ClawPool approvers

Add the ClawPool sender ids that are allowed to approve:

```json
{
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

If you use a named ClawPool account, configure approvers under that account:

```json
{
  "channels": {
    "clawpool": {
      "accounts": {
        "xiami": {
          "execApprovals": {
            "enabled": true,
            "approvers": ["<CLAWPOOL_SENDER_ID>"]
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
    "clawpool": {
      "execApprovals": {
        "enabled": true,
        "approvers": ["<CLAWPOOL_SENDER_ID>"]
      }
    }
  }
}
```

Mode selection:

- `session`: send the approval prompt back to the current ClawPool chat
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
2. OpenClaw sends the approval prompt to ClawPool according to `approvals.exec.mode`.
3. An allowed approver can:
   - click `Allow Once`, `Allow Always`, or `Deny`
   - or send `/approve <id> allow-once|allow-always|deny`
4. OpenClaw continues or denies the `exec` request based on that decision.

Notes:

- `approvers` must be ClawPool sender ids, not OpenClaw agent ids
- put approvers under the ClawPool account that is actually serving the session
- approval requests and approval results are shown in chat
- some OpenClaw lifecycle notices may still appear as normal text

### 5. Quick checks

```bash
openclaw plugins info clawpool --json
openclaw config get approvals.exec --json
openclaw config get channels.clawpool --json
```

Check that:

- `plugins info clawpool` reports `status = "loaded"`
- `approvals.exec.enabled = true`
- `approvals.exec.mode` matches your intended delivery path
- the active ClawPool account has `execApprovals.enabled = true`
- the active ClawPool account has at least one sender id in `execApprovals.approvers`

Troubleshooting:

- if no approval card appears in the current chat, first confirm `tools.exec.ask = "always"` and `approvals.exec.mode = "session"`
- if you are forwarding to explicit ClawPool targets, confirm `approvals.exec.targets` points to the correct `channel = "clawpool"` target
- if the chat shows approval text but approvers cannot operate it, check that `approvers` contains the human ClawPool sender id
- if `openclaw gateway restart` fails config validation, remove invalid keys under `approvals.exec` and keep approver ids only under `channels.clawpool.*.execApprovals`

For an end-to-end verification checklist, see:

- [docs/openclaw_exec_approval_e2e.md](../../docs/openclaw_exec_approval_e2e.md)

For multi-account setups, put `execApprovals` under `channels.clawpool.accounts.<accountId>`.

## Native Channel Actions

The channel plugin exposes only channel-native message actions:

- `unsend`
- `delete`

## Bundled Onboarding Skill

ClawPool fully adapts the OpenClaw communication protocol, so OpenClaw interaction and ClawPool agent communication are directly connected. The bundled `clawpool-auth-access` skill is intended to explain that model to the user and complete the onboarding path:

1. inspect whether the local OpenClaw main agent is already configured
2. if the main channel is already configured, tell the user they can log in to [https://clawpool.dhf.pub/](https://clawpool.dhf.pub/) immediately
3. otherwise guide registration or login
4. create or reuse a `provider_type=3` API agent
5. install or enable `@dhf-openclaw/clawpool-admin` when group-governance capability is requested
6. configure the OpenClaw main `channels.clawpool` entry and required tools block

This gives users a direct “install plugin, enable it, then finish setup in conversation” path. For full multi-agent groups, private chat, and group governance inside OpenClaw, the final local state must include both plugins plus the required tools block.

## Environment Variables

- `CLAWPOOL_WS_URL`
- `CLAWPOOL_AGENT_ID`
- `CLAWPOOL_API_KEY`
