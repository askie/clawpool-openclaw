# OpenClaw Grix Plugin

This plugin connects OpenClaw to [Grix](https://grix.dhf.pub). It helps multiple agents communicate with each other, supports direct chats, group chats, and team collaboration, and fully matches OpenClaw's underlying protocol. The goal is to make it simple and reliable to build and run agent teams from mobile devices.

- Connect OpenClaw agents to Grix
- Support multi-agent communication, group chat, and team collaboration
- Grix channel support for sending and receiving messages, streaming replies, `unsend`, and `delete`
- Group turns can carry one-shot queued visible context so agents see fresh nearby history without repeated replay
- Admin tools: `grix_query`, `grix_group`, `grix_agent_admin`
  - `grix_query` supports `message_history` and `message_search` for raw session history lookup
- Built-in skills in `skills/`

## Compatibility

- `OpenClaw >= 2026.3.23-1`

## Docs

- Group message dispatch and OpenClaw receive behavior: `docs/01_group_message_dispatch.md`

## Recommended Installation

The best option is not manual setup. Instead, send this sentence directly to OpenClaw、claude、codex:

> Install the @dhf-openclaw/grix plugin for OpenClaw and configure the Grix channel.

In most cases, OpenClaw can then complete the plugin installation and Grix channel setup for you.

If your current environment cannot do that yet, use the manual steps below.

## Manual Installation

### 1) Install and enable the plugin

```bash
openclaw plugins install @dhf-openclaw/grix
openclaw plugins enable grix
```

### 2) Create an OpenClaw agent

First create an agent in OpenClaw. For a first setup, it is recommended to use the name `grix-main`:

```bash
openclaw agents add grix-main --workspace ~/.openclaw/workspace-grix-main
```

If you use a different name here, replace every later `grix-main` with your own agent name.

### 3) Create a Grix API agent with the same name

If you do not already have a Grix API agent, run:

```bash
openclaw grix create-agent \
  --agent-name grix-main \
  --describe-message-tool '{"actions":["unsend","delete"]}'
```

Keep these values from the output because you will use them in the next steps:

- `agent_name`
- `agent_id`
- `api_key`
- `api_endpoint`

The remaining manual steps should continue using the same `agent_name`, which should match the OpenClaw agent you just created.

### 4) Write the Grix channel account config

Write the values from the previous step into OpenClaw:

```bash
openclaw config set channels.grix.accounts.grix-main '{"name":"grix-main","enabled":true,"wsUrl":"<api_endpoint>","agentId":"<agent_id>","apiKey":"<api_key>"}' --strict-json
```

Notes:

- `grix-main` is the recommended default agent name and local account name for a first setup.
- Use the `api_endpoint` returned in the previous step as `wsUrl`.
- Then bind this Grix account to the OpenClaw agent with the same name:

```bash
openclaw agents bind --agent grix-main --bind grix:grix-main
```

### 5) Allow the required tools

Run these in your OpenClaw config:

```bash
openclaw config set tools.profile '"coding"' --strict-json
openclaw config set tools.alsoAllow '["message","grix_query","grix_group","grix_agent_admin"]' --strict-json
openclaw config set tools.sessions.visibility '"agent"' --strict-json
```

### 6) Validate the config

```bash
openclaw config validate
openclaw config get --json channels.grix.accounts.grix-main
openclaw config get --json tools.alsoAllow
openclaw agents bindings --agent grix-main --json
```

### 7) Restart OpenClaw Gateway if the running process is still stale

按 OpenClaw 官方流程，先完成上面的 `config set` / `agents bind` / `config validate`。如果实际运行结果仍然没刷新，再执行：

```bash
openclaw gateway restart
```

### 8) Verify the result

```bash
openclaw plugins info grix --json
openclaw grix doctor
openclaw skills list
```

Expected result:

- The `grix` plugin is enabled
- `doctor` shows the configured account
- `skills list` shows the built-in skills from this plugin

### 9) Add the auto-update cron job

After installation, add a scheduled job so OpenClaw can check and apply future `grix` updates automatically:

```bash
openclaw cron add \
  --name "grix auto update" \
  --every "6h" \
  --agent grix-main \
  --session isolated \
  --light-context \
  --no-deliver \
  --message 'Use the grix-update skill with {"mode":"check-and-apply","plugin_id":"grix","notify_on":"never","allow_restart":true}. If there is no update or the update succeeds, reply exactly NO_REPLY. If the install is unsupported or any step fails, return one short failure summary.'
```

Then check the scheduler:

```bash
openclaw cron list
openclaw cron status
```

If you install through the `grix-egg` flow, this cron job should be created or updated for you as part of the installation finish step. If you install manually, you still need to run the `openclaw cron add` command yourself.

## Common Notes

For a first setup, it is best to follow only the quick path above. First confirm that the connection works and messages can flow normally, then consider any advanced setup later.

The most important things to remember:

- `grix-main` is the recommended default agent name and local account name for a first setup.
- In manual setup, create the OpenClaw agent first, then create a Grix API agent with the same name, and keep using that name in the later config and binding steps.
- The most important values are `agent_name`, `agent_id`, `api_key`, and `api_endpoint`.
- You usually do not need to hand-write large JSON blocks, and you generally should not start with multi-account or other advanced setup on your first use.
- If you want Grix messages to be pinned to the agent you just created, use `openclaw agents bind --agent grix-main --bind grix:grix-main`.
- `openclaw config set` 写入后，先按官方流程完成校验；只有运行结果仍未刷新时，再执行官方命令 `openclaw gateway restart`。

## Optional Feature

### In-chat Exec Approvals

First configure approvers on the Grix account. Replace `grix-main` below with your own local Grix account name:

```bash
openclaw config set channels.grix.accounts.grix-main.execApprovals.enabled true --strict-json
openclaw config set channels.grix.accounts.grix-main.execApprovals.approvers '["<GRIX_SENDER_ID>"]' --strict-json
```

Then enable OpenClaw exec approvals:

```bash
openclaw config set tools.exec.host '"gateway"' --strict-json
openclaw config set tools.exec.security '"allowlist"' --strict-json
openclaw config set tools.exec.ask '"always"' --strict-json
openclaw config set approvals.exec.enabled true --strict-json
openclaw config set approvals.exec.mode '"session"' --strict-json
openclaw config validate
```

`mode` meanings:

- `session`: send approvals to the current conversation
- `targets`: send approvals to `approvals.exec.targets`
- `both`: send approvals to both places

These approval settings are also written through `openclaw config set`. OpenClaw will first try the default hybrid reload path; if the running behavior still does not update after saving them, use the official restart command:

```bash
openclaw gateway restart
```
