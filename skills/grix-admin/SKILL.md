---
name: grix-admin
description: 负责 OpenClaw 本地配置与绑定；可通过当前 agent 的 WS 通道创建新的远端 API agent，并支持查询、创建、修改 agent 分类和给 agent 挂分类，供创建和管理 agent 流程复用。
---

# Grix Agent Admin

`grix-admin` 负责三件事：

1. 把已有远端 agent 参数落到本地 OpenClaw。
2. 当当前主 agent 已经在线、并且具备对应 scope 时，通过 `grix_admin` 的直连动作创建新的远端 API agent，再继续本地落地。
3. 在创建 agent 或后续管理 agent 时，复用 `grix_admin` 的直连动作查询分类、创建分类、修改分类、给 agent 挂分类。

## 进入方式

1. 大多数情况下，从 `grix_admin` 的 `task` 入口进入本技能；`task` 第一行必须明确写出 `bind-local`、`create-and-bind` 或 `category-manage`。
2. 只有在本技能内部执行“远端 API agent 创建 / 分类查询 / 分类创建 / 分类修改 / 分类挂载”这些远端步骤时，才直接调用一次 `grix_admin`，并且不要再传 `task`。
3. 新流程里，直接调用 `grix_admin` 时一律显式传 `action`：
   - `create_agent`
   - `list_categories`
   - `create_category`
   - `update_category`
   - `assign_category`
4. `create_agent` 的旧直连写法（只传 `accountId`、`agentName` 等字段，不传 `action`）仍可兼容，但新流程不要再使用。

## 直连动作清单

1. `action=create_agent`
   - 必填：`accountId`、`agentName`
   - 可选：`introduction`、`isMain`
2. `action=list_categories`
   - 必填：`accountId`
3. `action=create_category`
   - 必填：`accountId`、`name`、`parentId`
   - 可选：`sortOrder`
4. `action=update_category`
   - 必填：`accountId`、`categoryId`、`name`、`parentId`
   - 可选：`sortOrder`
5. `action=assign_category`
   - 必填：`accountId`、`agentId`、`categoryId`
   - `categoryId=0` 表示清空分类

## Mode A: bind-local（来自 grix-register 的首次交接）

输入字段（写在 `grix_admin.task` 里，且全必填）：

1. 第一行固定写 `bind-local`
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
   - `tools.alsoAllow`：至少包含 `message`、`grix_query`、`grix_group`、`grix_register`、`grix_message_send`、`grix_message_unsend`
   - 如果当前绑定目标就是主 agent，还要确保该 agent 自己的 `tools.alsoAllow` 保留 `grix_admin`、`grix_egg`、`grix_update`、`openclaw_memory_setup`；这组只放 agent 级别，不要写进全局 `tools.alsoAllow`
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
   - `openclaw config set tools.alsoAllow '["message","grix_query","grix_group","grix_register","grix_message_send","grix_message_unsend"]' --strict-json`
   - 如果当前绑定目标就是主 agent，还要把 `grix_admin`、`grix_egg`、`grix_update`、`openclaw_memory_setup` 合并进该 agent 自己那条 `agents.list` 记录里的 `tools.alsoAllow`；不要把这组写进全局 `tools.alsoAllow`
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

写在 `grix_admin.task` 里的字段：

1. 第一行固定写 `create-and-bind`
2. `accountId`（必填）：当前会话对应的确切 Grix 账号 ID
3. `agentName`（必填）
4. `introduction`（可选）
5. `isMain`（可选，默认 `false`）
6. `categoryId`（可选）：把新 agent 直接挂到现有分类
7. `categoryName`（可选）：如果不存在就创建后再挂载
8. `parentCategoryId`（可选）：只在 `categoryName` 方案里使用，默认 `0`
9. `categorySortOrder`（可选）：只在创建分类时使用

执行规则：

1. 先确认本地已经存在可用的 `channels.grix.accounts.<accountId>`，而且当前会话实际绑定的也是这个账号；禁止跨账号执行。
2. 如果同时给了 `categoryId` 和 `categoryName`，直接报错并停止，避免歧义。
3. 通过 `grix_admin` 只调用一次远端创建，调用时传：
   - `action=create_agent`
   - `accountId`
   - `agentName`
   - 可选 `introduction`
   - 可选 `isMain`
4. 远端创建成功后，读取返回结果里的 `createdAgent.id`、`createdAgent.agent_name`、`createdAgent.api_endpoint`、`createdAgent.api_key`。
5. 如果请求里带了分类信息，再执行分类阶段：
   - 已给 `categoryId`：直接调用 `action=assign_category`
   - 已给 `categoryName`：先调用 `action=list_categories`
   - 若在同一个 `parentCategoryId` 下找到唯一同名分类，复用它
   - 若没找到，再调用 `action=create_category`
   - 得到分类 ID 后，再调用 `action=assign_category`
6. `categoryName` 流程里，若同一父分类下出现多个完全同名分类，停止并要求 owner 先整理分类或改用明确的 `categoryId`。
7. 远端创建和可选的分类阶段成功后，再立刻转入 `bind-local` 的本地绑定步骤。
8. `isMain=true` 只在确实要创建新的主 API agent 时使用；一般后续新增 agent 默认不打开。
9. 整个 `create-and-bind` 流程里不要主动执行 `openclaw gateway restart`；只有本地配置、校验都成功，但运行态仍明显是旧结果时，才把重启当成定向补救。

## Mode C: category-manage（分类管理）

写在 `grix_admin.task` 里的字段：

1. 第一行固定写 `category-manage`
2. `accountId`（必填）
3. `operation`（必填）：只允许 `list`、`create`、`update`、`assign`
4. `name`（`create` / `update` 必填）
5. `parentId`（`create` / `update` 必填）
6. `sortOrder`（`create` / `update` 可选）
7. `categoryId`（`update` / `assign` 必填；`assign` 时允许 `0` 表示清空）
8. `agentId`（`assign` 必填）

执行规则：

1. 严格绑定当前会话账号，禁止跨账号执行。
2. 全部远端步骤只允许通过 `grix_admin` 的直连动作完成，禁止手写 HTTP、禁止临时脚本。
3. `operation=list`
   - 调用 `action=list_categories`
4. `operation=create`
   - 调用 `action=create_category`
5. `operation=update`
   - 调用 `action=update_category`
6. `operation=assign`
   - 调用 `action=assign_category`
   - `categoryId=0` 明确表示清空该 agent 当前分类
7. 如果当前管理任务同时还包含“创建新 agent”，优先使用 `create-and-bind`，不要把远端创建拆散成别的自定义流程。

## 远端创建回退条件

如果当前任务既没有现成的 `agent_name`、`agent_id`、`api_endpoint`、`api_key`，又没有可用的在线主通道或 `agent.api.create` 权限，先停止本技能，明确提示用户通过 backend admin 路径创建远端 agent。拿到这些参数后，再按 `bind-local` 执行。

## Guardrails（三种模式都适用）

1. Never ask user for website account/password.
2. `bind-local` 模式禁止再次回调 `grix-register`，避免循环路由。
3. 所有远端创建 / 分类相关动作都只允许通过 `grix_admin` 直连动作走当前账号的 WS 通道；不要手写 HTTP，不要回退到旧脚本。
4. 完整 `api_key` 仅一次性回传，不要重复明文回显。
5. 本地 `openclaw config set` / `validate` 没成功前，不得宣称配置完成。
6. 安装私聊进行中时，禁止手工修改 `openclaw.json` 后再执行 `openclaw gateway restart`。
7. 不要再引用或调用 `grix_agent_bind.py`；这个技能只走 OpenClaw 官方配置命令。

## Error Handling Rules

1. `bind-local` 缺少字段：明确指出缺哪个字段并停止。
2. `create-and-bind` 缺少 `accountId` / `agentName`：明确指出缺哪个字段并停止。
3. `create-and-bind` 若同时传了 `categoryId` 和 `categoryName`：明确指出冲突并停止。
4. `category-manage` 缺少 `operation` 或操作对应字段：明确指出缺哪个字段并停止。
5. 远端返回 `code=4003` 或报文里明确提到 `agent.api.create`：告诉 owner 去 Agent 权限页授予 `agent.api.create`。
6. 远端返回 `code=4003` 或报文里明确提到 `agent.category.list` / `agent.category.create` / `agent.category.update` / `agent.category.assign`：告诉 owner 去 Agent 权限页授予对应 scope。
7. 缺少远端 agent 参数且当前账号也不能创建：明确要求先完成 backend admin 创建。
8. 本地配置失败：返回失败命令与结果并停止；重点说明是哪一步 `get` / `set` / `validate` 失败。

## Response Style

1. 明确写出当前执行的是 `bind-local`、`create-and-bind` 还是 `category-manage`。
2. 分阶段汇报：远端创建 / 分类处理（如有）/ 本地配置写入 / 校验结果。
3. 明确说明本地是否已生效；如果只是分类步骤成功，也要单独写清楚。
4. 如果远端创建成功但分类或本地绑定后续失败，要明确说明是“部分完成”，不要笼统写成成功。

## References

1. [references/api-contract.md](references/api-contract.md)
