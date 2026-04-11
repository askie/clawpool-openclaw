# API Contract

## Purpose

`grix-admin` 负责本地绑定，并在当前 agent 已具备对应 scope 时，支持通过 `grix_admin` 走 WS 完成：

1. 创建新的远端 API agent
2. 查询当前账号下的 agent 分类
3. 创建分类
4. 修改分类
5. 给指定 agent 挂分类或清空分类

## Base Rules

1. Do not ask users to provide website account/password for this flow.
2. 所有远端创建和分类动作都必须通过 `grix_admin` 走当前账号已认证的 WS 通道。
3. 如果 `agent_name` / `agent_id` / `api_endpoint` / `api_key` 不完整，且当前账号也不能远端创建，先停止并要求 backend admin 先补全。
4. 当前 agent 必须先在前端权限页勾选对应 scope；没有 scope 时，WS 会直接失败。

## Direct `grix_admin` Contract

### 1. Create Remote Agent

```json
{
  "action": "create_agent",
  "accountId": "grix-main",
  "agentName": "ops helper",
  "introduction": "负责发布和值班协作",
  "isMain": false
}
```

返回里重点读取：

1. `createdAgent.id`
2. `createdAgent.agent_name`
3. `createdAgent.api_endpoint`
4. `createdAgent.api_key`

需要的 scope：

1. `agent.api.create`

### 2. List Categories

```json
{
  "action": "list_categories",
  "accountId": "grix-main"
}
```

需要的 scope：

1. `agent.category.list`

### 3. Create Category

```json
{
  "action": "create_category",
  "accountId": "grix-main",
  "name": "项目助理",
  "parentId": "0",
  "sortOrder": 10
}
```

需要的 scope：

1. `agent.category.create`

### 4. Update Category

```json
{
  "action": "update_category",
  "accountId": "grix-main",
  "categoryId": "20001",
  "name": "值班助理",
  "parentId": "0",
  "sortOrder": 20
}
```

需要的 scope：

1. `agent.category.update`

### 5. Assign or Clear Category

```json
{
  "action": "assign_category",
  "accountId": "grix-main",
  "agentId": "10001",
  "categoryId": "20001"
}
```

清空分类：

```json
{
  "action": "assign_category",
  "accountId": "grix-main",
  "agentId": "10001",
  "categoryId": "0"
}
```

需要的 scope：

1. `agent.category.assign`

## Local Bind Steps

当远端 agent 参数齐全后，继续通过 OpenClaw 官方 CLI 完成本地绑定：

1. 准备本地目录：
   - `workspace=~/.openclaw/workspace-<agent_name>`
   - `agentDir=~/.openclaw/agents/<agent_name>/agent`
   - 缺必要 persona 文件时补最小 `IDENTITY.md`、`SOUL.md`、`AGENTS.md`
2. 按以下顺序解析 `model`：
   - 该本地 agent 现有条目的 `model`
   - `agents.defaults.model.primary`
   - 还拿不到就明确报错并停止
3. 读取当前配置并合并：
   - `channels.grix.accounts`
   - `agents.list`
   - `tools.profile`
   - `tools.alsoAllow`
   - `tools.sessions.visibility`
4. 用官方 CLI 写回：
   - `channels.grix.accounts.<agent_name>`
   - `agents.list`
   - `openclaw agents bind --agent <agent_name> --bind grix:<agent_name>`
   - `tools.profile`
   - `tools.alsoAllow`
   - `tools.sessions.visibility`
   - 如需，恢复 `channels.grix.enabled=true`
5. 写完后校验：
   - `openclaw config validate`
   - `openclaw config get --json channels.grix.accounts.<agent_name>`
   - `openclaw config get --json agents.list`
   - `openclaw agents bindings --agent <agent_name> --json`

## `bind-local` Input Contract

```json
{
  "task": "bind-local\nagent_name=grix-main\nagent_id=2029786829095440384\napi_endpoint=wss://grix.dhf.pub/v1/agent-api/ws?agent_id=2029786829095440384\napi_key=ak_xxx\ndo_not_create_remote_agent=true"
}
```

这个模式只做本地绑定。

## `create-and-bind` Input Contract

当主 agent 已具备可用账号和 `agent.api.create` scope 时，可通过 `grix_admin.task` 进入创建流程：

```json
{
  "task": "create-and-bind\naccountId=grix-main\nagentName=ops helper\nintroduction=负责发布和值班协作\nisMain=false\ncategoryName=项目助理\nparentCategoryId=0\ncategorySortOrder=10"
}
```

这个模式里要按顺序做：

1. 直连一次 `action=create_agent`
2. 如果给了 `categoryId`，直连一次 `action=assign_category`
3. 如果给了 `categoryName`，先 `action=list_categories`
4. 没找到就 `action=create_category`
5. 拿到分类 ID 后再 `action=assign_category`
6. 最后走和 `bind-local` 相同的本地绑定流程

注意：

1. `categoryId` 和 `categoryName` 不能同时提供
2. `categoryName` 匹配时要同时考虑 `parentCategoryId`
3. 若远端返回缺少 `agent.api.create` 或某个 `agent.category.*` scope，要明确指出缺的就是哪个 scope

## `category-manage` Input Contract

当只是做后续分类管理时，通过 `grix_admin.task` 进入：

```json
{
  "task": "category-manage\naccountId=grix-main\noperation=assign\nagentId=10001\ncategoryId=0"
}
```

映射关系：

1. `operation=list` -> `action=list_categories`
2. `operation=create` -> `action=create_category`
3. `operation=update` -> `action=update_category`
4. `operation=assign` -> `action=assign_category`

其中：

1. `operation=assign` 时 `categoryId=0` 表示清空分类
2. 任何一步都不能跨账号执行
3. 禁止自己手写 HTTP 或回退到旧脚本
