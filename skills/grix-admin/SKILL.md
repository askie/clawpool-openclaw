---
name: grix-admin
description: 负责 OpenClaw 本地配置与绑定；可接收已有远端 agent 参数直接落地，也可在已有主通道与权限时通过当前 agent 的 WS 通道创建新的远端 API agent 后继续落地。
---

# Grix Agent Admin

`grix-admin` 负责两件事：

1. 把已有远端 agent 参数落到本地 OpenClaw。
2. 当当前主 agent 已经在线、并且具备 `agent.api.create` 权限时，通过 `grix_agent_admin` 走 WS 创建新的远端 API agent，再继续本地落地。

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
   - persona 文件只放 `workspace` 根目录：`IDENTITY.md`、`SOUL.md`、`AGENTS.md`，以及可选的 `USER.md` / `MEMORY.md`
   - 不要把 persona 文件放进 `agentDir`；`agentDir` 是 OpenClaw 管理的每个 agent 运行状态目录
   - 如果 `workspace` 里缺少必要 persona 文件，补最小文件，避免新 agent 工作区为空
3. 读取现有配置；若路径不存在，按空对象 / 空数组处理：
   - `channels.grix.accounts`
   - `agents.list`
   - `tools.profile`
   - `tools.alsoAllow`
   - `tools.sessions.visibility`
   - 如需确认已有 Grix 绑定，额外用 `openclaw agents bindings --agent <agent_name> --json` 查看当前绑定列表
4. 计算本次目标值：
   - `channels.grix.accounts.<agent_name>`：写入 `name`、`enabled=true`、`apiKey`、`wsUrl`、`agentId`
   - `agents.list`：确保存在 `id=<agent_name>`、`name=<agent_name>`、`workspace`、`agentDir`、`model`
   - Grix 绑定：确保目标 agent 最终绑定到 `grix:<agent_name>`
   - `tools.profile`：设为 `"coding"`
   - `tools.alsoAllow`：至少包含 `message`、`grix_query`、`grix_group`、`grix_register`、`grix_agent_admin`
   - `tools.sessions.visibility`：设为 `"agent"`
   - 如果 `channels.grix.enabled=false`，改回 `true`
5. `model` 的确定规则：
   - 先复用该本地 agent 现有条目的 `model`
   - 如果现有条目没有，再用 `agents.defaults.model.primary`
   - 如果仍然拿不到，明确说明缺少 model，停止执行，不要瞎猜
6. 用官方 CLI 逐项写入，不要整份覆盖配置：
   - `openclaw config set channels.grix.accounts.<agent_name> '<ACCOUNT_JSON>' --strict-json`
   - `openclaw config set agents.list '<NEXT_AGENTS_LIST_JSON>' --strict-json`
   - `openclaw agents bind --agent <agent_name> --bind grix:<agent_name>`
   - `openclaw config set tools.profile '"coding"' --strict-json`
   - `openclaw config set tools.alsoAllow '["message","grix_query","grix_group","grix_register","grix_agent_admin"]' --strict-json`
   - `openclaw config set tools.sessions.visibility '"agent"' --strict-json`
   - 仅当当前配置明确把 `channels.grix.enabled` 关掉时，再执行 `openclaw config set channels.grix.enabled true --strict-json`
7. 写完后必须执行校验：
   - `openclaw config validate`
   - `openclaw config get --json channels.grix.accounts.<agent_name>`
   - `openclaw config get --json agents.list`
   - `openclaw agents bindings --agent <agent_name> --json`
8. 安装私聊进行中时不要主动执行 `openclaw gateway restart`；先完成 `openclaw config set`、`openclaw agents bind`、`openclaw config validate` 和读取校验。
9. 如果安装已经完成、配置和绑定都确认正确，但后续实际对话里仍然表现成旧运行态，再使用官方命令 `openclaw gateway restart` 做一次定向补救，然后重新校验绑定和实际行为。

## Mode B: create-and-bind（已有主通道与 scope 时的后续管理）

输入参数：

1. `mode=create-and-bind`
2. `accountId`（必填）：当前会话对应的确切 Grix 账号 ID
3. `agentName`（必填）
4. `introduction`（可选）
5. `isMain`（可选，默认 `false`）

执行规则：

1. 先确认本地已经存在可用的 `channels.grix.accounts.<accountId>`，而且当前会话实际绑定的也是这个账号；禁止跨账号执行。
2. 通过 `grix_agent_admin` 只调用一次远端创建，禁止手写 HTTP / 临时脚本。
3. 远端创建成功后，读取返回的 `id`、`agent_name`、`api_endpoint`、`api_key`，然后立刻转入 `bind-local` 的本地绑定步骤。
4. `isMain=true` 只在确实要创建新的主 API agent 时使用；一般后续新增 agent 默认不打开。
5. 整个 `create-and-bind` 流程里不要主动执行 `openclaw gateway restart`；只有本地配置、校验都成功，但运行态仍明显是旧结果时，才把重启当成定向补救。

## 远端创建回退条件

如果当前任务既没有现成的 `agent_name`、`agent_id`、`api_endpoint`、`api_key`，又没有可用的在线主通道或 `agent.api.create` 权限，先停止本技能，明确提示用户通过 backend admin 路径创建远端 agent。拿到这些参数后，再按 `bind-local` 执行。

## Guardrails（两种模式都适用）

1. Never ask user for website account/password.
2. `bind-local` 模式禁止再次回调 `grix-register`，避免循环路由。
3. `create-and-bind` 只允许通过 `grix_agent_admin` 走当前账号的 WS 通道创建；不要手写 HTTP，不要回退到旧脚本。
4. 完整 `api_key` 仅一次性回传，不要重复明文回显。
5. 本地 `openclaw config set` / `validate` 没成功前，不得宣称配置完成。
6. 安装私聊进行中时，禁止手工修改 `openclaw.json` 后再执行 `openclaw gateway restart`。
7. 不要再引用或调用 `grix_agent_bind.py`；这个技能只走 OpenClaw 官方配置命令。

## Error Handling Rules

1. `bind-local` 缺少字段：明确指出缺哪个字段并停止。
2. `create-and-bind` 缺少 `accountId` / `agentName`：明确指出缺哪个字段并停止。
3. `create-and-bind` 返回 `code=4003` 或报文里明确提到 `agent.api.create`：告诉 owner 去 Agent 权限页授予 `agent.api.create`。
4. 缺少远端 agent 参数且当前账号也不能创建：明确要求先完成 backend admin 创建。
5. 本地配置失败：返回失败命令与结果并停止；重点说明是哪一步 `get` / `set` / `validate` 失败。

## Response Style

1. 明确写出当前执行的是 `bind-local` 还是 `create-and-bind`。
2. 分阶段汇报：远端创建（如有）+ 本地配置写入 + 校验结果。
3. 明确说明本地是否已生效，失败则给具体原因。

## References

1. [references/api-contract.md](references/api-contract.md)
