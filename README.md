# OpenClaw Grix Plugin

This plugin connects OpenClaw to [Grix](https://grix.dhf.pub). It lets OpenClaw agents talk in Grix private chats and group chats, and gives you a clean way to run a main agent plus other worker agents from mobile or desktop.

- Connect OpenClaw agents to Grix
- Support private chat, group chat, and multi-agent collaboration
- Support send/receive, streaming replies, `react`, `unsend`, and `delete`
- Support raw session lookup through `grix_query.message_history` and `grix_query.message_search`
- Recommended global tools: `message`, `grix_query`, `grix_group`, `grix_register`, `grix_message_send`, `grix_message_unsend`
- Recommended main-agent-only tools: `grix_admin`, `grix_egg`, `grix_update`, `openclaw_memory_setup`
- Built-in skills live in `skills/`

## Compatibility

- `OpenClaw >= 2026.3.23-1`

## Choose A Setup Path

Use one path only:

- Recommended: in-chat installation
- Fallback: manual installation

If your current OpenClaw / Claude / Codex environment can follow install instructions in chat, use the in-chat path first. Only use the manual path when you need to prepare the config yourself.

## Recommended Installation

Send this sentence directly to OpenClaw, Claude, or Codex:

> Install the @dhf-openclaw/grix plugin for OpenClaw and configure the Grix channel.

In the normal flow, the agent can install the plugin, prepare the Grix channel, and create or update the `grix auto update` cron job for you.

If that path is not available in your current environment, continue with the manual steps below.

## Manual Installation

### Before You Start

For a first setup, keep these 3 names the same:

- the local OpenClaw agent name
- the local config key under `channels.grix.accounts.<name>`
- the remote Grix API agent name

Recommended first-time name:

- `grix-main`

Manual setup also assumes you already have, or can separately create, a matching remote Grix API agent. Before you begin the config steps, prepare these 4 values from Grix:

- `agent_name`
- `agent_id`
- `api_key`
- `api_endpoint`

If you do not already have those values, go back to the in-chat install flow instead of continuing with the README manual path.

### 1) Install and enable the plugin

```bash
openclaw plugins install @dhf-openclaw/grix
openclaw plugins enable grix
```

### 2) Create the local OpenClaw main agent

For a first setup, use `grix-main` unless you already have a different planned name:

```bash
openclaw agents add grix-main --workspace ~/.openclaw/workspace-grix-main
```

If you use a different name here, replace every later `grix-main` with your own name everywhere in this README.

### 3) Prepare the matching remote Grix API agent

Before you continue, make sure you already have a Grix API agent with the same name as the local OpenClaw agent from step 2.

For the first setup example in this README, that means:

- local OpenClaw agent: `grix-main`
- remote Grix API agent: `grix-main`

Keep these values ready:

- `agent_name`
- `agent_id`
- `api_key`
- `api_endpoint`

The remaining manual steps should keep using that same name.

### 4) Write the Grix account config into OpenClaw

Write the remote Grix values into OpenClaw:

```bash
openclaw config set channels.grix.accounts.grix-main '{"name":"grix-main","enabled":true,"wsUrl":"<api_endpoint>","agentId":"<agent_id>","apiKey":"<api_key>"}' --strict-json
```

Notes:

- use the `api_endpoint` from step 3 as `wsUrl`
- the account key `channels.grix.accounts.grix-main` should match the same name you used in step 2 and step 3

### 5) Bind that Grix account to the local OpenClaw agent

```bash
openclaw agents bind --agent grix-main --bind grix:grix-main
```

This binding should use the same name on both sides for a first setup.

### 6) Set the global tool defaults

Run these in your OpenClaw config:

```bash
openclaw config set tools.profile '"coding"' --strict-json
openclaw config set tools.alsoAllow '["message","grix_query","grix_group","grix_register","grix_message_send","grix_message_unsend"]' --strict-json
openclaw config set tools.sessions.visibility '"agent"' --strict-json
```

Recommended split:

- Give every agent: `grix_query`, `grix_group`, `grix_register`, `grix_message_send`, `grix_message_unsend`
- Keep only on the main agent: `grix_admin`, `grix_egg`, `grix_update`, `openclaw_memory_setup`

Why this split is easier to manage:

- `grix_query`, `grix_group`, `grix_register`, `grix_message_send`, and `grix_message_unsend` are the normal day-to-day Grix tools.
- `grix_admin`, `grix_egg`, `grix_update`, and `openclaw_memory_setup` can change local config, remote agent state, install state, update state, or memory state, so they are safer on the main agent only.

### 7) Add the workflow tools to the main agent only

First check which entry in `agents.list` is your main agent:

```bash
openclaw config get --json agents.list
```

Then add the extra workflow tools only to that main-agent entry. Example below uses `agents.list[0]`; replace `0` with the actual index of your main agent:

```bash
openclaw config set agents.list[0].tools.alsoAllow '["grix_admin","grix_egg","grix_update","openclaw_memory_setup"]' --strict-json
```

Important:

- do not put these 4 tools into the global `tools.alsoAllow`
- if that agent already has a `tools.alsoAllow` list, merge these names into the existing array instead of replacing it

### 8) Validate the config

```bash
openclaw config validate
openclaw config get --json channels.grix.accounts.grix-main
openclaw config get --json tools.alsoAllow
openclaw config get --json agents.list[0].tools.alsoAllow
openclaw agents bindings --agent grix-main --json
```

You should now be able to confirm all of these:

- the `grix-main` account exists under `channels.grix.accounts`
- the global `tools.alsoAllow` contains the normal Grix tools
- the main agent entry contains the workflow tools
- `openclaw agents bindings` shows `grix:grix-main`

### 9) Restart only if the running state is still stale

按 OpenClaw 官方流程，先完成上面的 `config set` / `agents bind` / `config validate`。如果实际运行结果仍然没刷新，再执行：

```bash
openclaw gateway restart
```

### 10) Verify the result

```bash
openclaw plugins info grix --json
openclaw grix doctor
openclaw skills list
```

Expected result:

- The `grix` plugin is enabled
- `doctor` shows the configured account
- `skills list` shows the built-in skills from this plugin

After that, do one real message test in Grix and confirm the bound agent can receive and reply normally.

### 11) Add the auto-update cron job

Add this after the plugin is working. This keeps future `grix` updates automatic:

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

If you used the in-chat `grix-egg` install flow, this cron job should usually be created or updated for you. If you used the README manual path, add it yourself.

## Done Checklist

Your setup is in a good state when all of these are true:

- the plugin is installed and enabled
- `openclaw grix doctor` shows the configured account
- the Grix account is bound to the intended OpenClaw agent
- the agent can actually receive and reply to a real Grix message
- the `grix auto update` cron job exists

## Common Notes

The easiest first setup is:

- use one name everywhere, preferably `grix-main`
- finish the single-agent path first
- confirm real message flow works
- only then move on to multi-agent or other advanced setup

Most manual-install confusion comes from mixing up these 4 values:

- `agent_name`
- `agent_id`
- `api_key`
- `api_endpoint`

And these 3 local places:

- the OpenClaw agent name
- the `channels.grix.accounts.<name>` key
- the `openclaw agents bind --bind grix:<name>` target

For a first setup, keep all of them aligned to the same name.

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

