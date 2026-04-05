---
name: grix-admin
description: 负责 OpenClaw 本地配置与后续 agent 管理；支持接收 grix-register 交接参数直接落地，也支持在已有主密钥下新建 agent 再落地。
---

# Grix Agent Admin

`grix-admin` 只负责本地配置和管理动作。支持两个入口模式，二选一执行。

## Mode A: bind-local（来自 grix-register 的首次交接）

输入参数（全必填）：

1. `mode=bind-local`
2. `agent_name`
3. `agent_id`
4. `api_endpoint`
5. `api_key`

执行规则：

1. 不做远端创建，直接执行本地绑定，不要调用任何会直接改 `openclaw.json` 的脚本。
2. 先准备本地目录：
   - `workspace=~/.openclaw/workspace-<agent_name>`
   - `agentDir=~/.openclaw/agents/<agent_name>/agent`
   - 如果 `AGENTS.md`、`MEMORY.md`、`USER.md` 不存在，补最小文件，避免新 agent 工作区为空
3. 读取现有配置；若路径不存在，按空对象 / 空数组处理：
   - `channels.grix.accounts`
   - `agents.list`
   - `bindings`
   - `tools.profile`
   - `tools.alsoAllow`
   - `tools.sessions.visibility`
4. 计算本次目标值：
   - `channels.grix.accounts.<agent_name>`：写入 `name`、`enabled=true`、`apiKey`、`wsUrl`、`agentId`
   - `agents.list`：确保存在 `id=<agent_name>`、`name=<agent_name>`、`workspace`、`agentDir`、`model`
   - `bindings`：确保存在 `{ "type": "route", "agentId": "<agent_name>", "match": { "channel": "grix", "accountId": "<agent_name>" } }`
   - `tools.profile`：设为 `"coding"`
   - `tools.alsoAllow`：至少包含 `message`、`grix_query`、`grix_group`、`grix_agent_admin`
   - `tools.sessions.visibility`：设为 `"agent"`
   - 如果 `channels.grix.enabled=false`，改回 `true`
5. `model` 的确定规则：
   - 先复用该本地 agent 现有条目的 `model`
   - 如果现有条目没有，再用 `agents.defaults.model.primary`
   - 如果仍然拿不到，明确说明缺少 model，停止执行，不要瞎猜
6. 用 `openclaw config set ... --strict-json` 逐项写入，不要整份覆盖配置：
   - `openclaw config set channels.grix.accounts.<agent_name> '<ACCOUNT_JSON>' --strict-json`
   - `openclaw config set agents.list '<NEXT_AGENTS_LIST_JSON>' --strict-json`
   - `openclaw config set bindings '<NEXT_BINDINGS_JSON>' --strict-json`
   - `openclaw config set tools.profile '"coding"' --strict-json`
   - `openclaw config set tools.alsoAllow '["message","grix_query","grix_group","grix_agent_admin"]' --strict-json`
   - `openclaw config set tools.sessions.visibility '"agent"' --strict-json`
   - 仅当当前配置明确把 `channels.grix.enabled` 关掉时，再执行 `openclaw config set channels.grix.enabled true --strict-json`
7. 写完后必须执行校验：
   - `openclaw config validate`
   - `openclaw config get --json channels.grix.accounts.<agent_name>`
   - `openclaw config get --json agents.list`
   - `openclaw config get --json bindings`
8. 安装私聊进行中时不要执行 `openclaw gateway restart`；`openclaw config set` 的热重载应当让配置立即生效。

## Mode B: create-and-bind（已有主密钥时的后续管理）

输入参数：

1. `agentName`（必填）：`^[a-z][a-z0-9-]{2,31}$`
2. `describeMessageTool`（必填）：`actions` 非空
3. `accountId`（可选）
4. `avatarUrl`（可选）

执行规则：

1. 先确认本地已经有可用的 Grix 账号配置，位置是 `channels.grix.accounts.<accountId>`；如果当前上下文没给 `accountId`，按默认账号处理。
2. 若目标账号缺失、禁用，或 `apiKey` / `wsUrl` / `agentId` 任一为空，说明主通道还没完成，不做本模式，立刻切回 `grix-register`。
3. 若本地主通道已存在，再调用 `grix_agent_admin` 创建远端 agent（仅一次，不自动重试）。
4. 创建成功后，执行本地绑定（同 Mode A）。
5. 整个 `create-and-bind` 流程里不要执行 `openclaw gateway restart`。

## Guardrails（两种模式都适用）

1. Never ask user for website account/password.
2. `bind-local` 模式禁止再次回调 `grix-register`，避免循环路由。
3. 远端创建（Mode B）视为非幂等，不确认不自动重试。
4. 完整 `api_key` 仅一次性回传，不要重复明文回显。
5. 本地 `openclaw config set` / `validate` 没成功前，不得宣称配置完成。
6. 安装私聊进行中时，禁止手工修改 `openclaw.json` 后再执行 `openclaw gateway restart`。
7. 不要再引用或调用 `grix_agent_bind.py`；这个技能只走 OpenClaw 官方配置命令。

## Error Handling Rules

1. `bind-local` 缺少字段：明确指出缺哪个字段并停止。
2. invalid name（Mode B）：要求用户提供合法小写英文名。
3. `403/20011`：提示 owner 授权 `agent.api.create`。
4. `401/10001`：检查本地 `agent_api_key` 或 grix 账号配置。
5. `409/20002`：要求更换 agent 名称。
6. 本地配置失败：返回失败命令与结果并停止；重点说明是哪一步 `get` / `set` / `validate` 失败。

## Response Style

1. 明确写出当前执行的是 `bind-local` 还是 `create-and-bind`。
2. 分阶段汇报：远端（如有）+ 本地绑定。
3. 明确说明本地是否已生效，失败则给具体原因。

## References

1. [references/api-contract.md](references/api-contract.md)
