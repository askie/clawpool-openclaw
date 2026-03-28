---
name: egg-install
description: 在虾塘触发的安装私聊中处理 egg 安装。适用于主 OpenClaw agent 收到包含 install_id、egg、install、main_agent 的安装上下文时，负责与用户多轮确认、执行 persona.zip 到 OpenClaw agent 或 skill.zip 到 Claude agent 的正规安装流程，并在当前私聊里持续回报进度、失败原因和最终结果。
---

# Egg Install

仅在"虾塘发起的安装私聊"里使用这个技能。

这类会话通常会先收到一条系统代发的安装请求，正文里会带一个 JSON 上下文块，至少包含：

- `install_id` — 安装单唯一 ID，所有状态指令必须使用原值
- `egg` — egg 包标识，格式为 `<name>@<version>` 或带完整下载 URL 的对象
- `install` — 安装模式，枚举值：`create_new`（新建目标 agent）或 `existing_agent`（安装到已有 agent）
- `main_agent` — 发起安装的主 OpenClaw agent ID，安装完成后如需通知或回调，使用该 ID

你的职责不是返回隐藏协议结果，而是直接在当前私聊里把安装流程做完。

## 工作方式

1. 先读完整个 JSON 上下文，确认 egg、版本、安装模式和目标类型。
2. 在真正动手前，先在当前私聊里和用户确认关键目标。
3. `create_new` 时，先确认新 agent 的命名和用途，再继续创建。
4. `existing_agent` 时，只能操作上下文里指定的目标 agent，不要私自换目标。
5. 安装过程中，每完成一个关键动作就用自然语言回报一次进度。
6. 在"包下载完成"和"安装内容落位完成待校验"两个节点，各额外发送一条 `status=running` 的**独立安装状态指令消息**。
7. 最终成功或失败时，必须发送一条 `status=success` 或 `status=failed` 的**独立安装状态指令消息**。
8. 出错时，直接说明失败点、影响和下一步建议，不要模糊带过。
9. 最终明确告诉用户：装到了哪个 agent、结果成功还是失败、后续是否还要继续操作。

## 绝对规则

- 只在当前私聊里沟通，不要切换到隐藏协议，不要输出机器专用 JSON。
- 必须按 OpenClaw / Claude 的正规步骤安装，不要直接改后端数据库。
- 需要创建远端 API agent 时，使用 `clawpool_agent_admin`。
- `persona.zip` 只能面向 OpenClaw 目标。
- `skill.zip` 只能面向 Claude 目标。
- 不要自动新建 Claude 目标 agent。
- 没完成校验前，绝不能宣称安装成功。
- 如果新建目标后又失败了，能安全回滚就先回滚；不能回滚就如实告诉用户当前残留状态。
- 最终成功或失败时，必须发送一条独立的 `egg-install-status` 指令消息。
- 状态指令消息必须单独发送，不要和自然语言解释混在同一条里。
- 用户拒绝确认或主动取消时，必须发送 `status=failed`、`error_code=user_cancelled` 的状态指令后再结束。

## 安装状态指令

server 不会猜自然语言。要让安装单进入"进行中 / 成功 / 失败"，你必须发送这类单行消息：

```text
[[egg-install-status|install_id=<INSTALL_ID>|status=<running|success|failed>|step=<STEP>|summary=<URI_ENCODED_SUMMARY>]]
```

常用可选字段：

- `target_agent_id=<AGENT_ID>`：成功时尽量带上，尤其是 `create_new`。
- `detail_text=<URI_ENCODED_DETAIL>`：补充更长说明。
- `error_code=<ERROR_CODE>`：失败时建议带上。
- `error_msg=<URI_ENCODED_ERROR_MSG>`：失败时建议带上。

规则：

1. `install_id` 必须使用上下文里的原值。
2. `status` 只能是 `running`、`success`、`failed`。
3. `summary`、`detail_text`、`error_msg` 如果有空格、中文或特殊字符，按 URI component 编码。
4. 这条指令只负责状态收口；如果要跟用户解释原因，另发一条正常文字消息。
5. `create_new` 成功时，必须尽量带 `target_agent_id`，否则 server 可能无法通过最终校验。

## 推荐流程

### `persona.zip` -> OpenClaw

1. 读取上下文，确认是 `create_new` 还是 `existing_agent`。
2. 和用户确认目标 agent 或新 agent 命名；**用户拒绝则发 `failed/user_cancelled` 指令后结束**。
3. 如果需要新建远端 API agent，用 `clawpool_agent_admin` 创建。
4. 用 OpenClaw 正规步骤准备本地目标目录和配置。
5. 下载 egg 包，并校验 hash / manifest（如果上下文提供）。
6. 发送 `status=running`、`step=downloaded` 状态指令。
7. 安装 persona 内容。
8. 发送 `status=running`、`step=installed` 状态指令。
9. 按需刷新或重启本地运行时。
10. 校验目标 agent 仍然可用。
    - 校验失败 → 尝试回滚（含步骤3新建的远端 agent），无法回滚则如实告知残留状态 → 发 `failed` 指令后结束。
11. 发送 `status=success` 状态指令（带 `target_agent_id`），再向用户汇报完成。

### `skill.zip` -> Claude

1. 确认上下文指定的 Claude 目标 agent 存在；**不存在则发 `failed/target_not_found` 指令后结束**。
2. 和用户确认目标 agent；**用户拒绝则发 `failed/user_cancelled` 指令后结束**。
3. 下载 skill 包，并校验 hash / manifest（如果上下文提供）。
4. 发送 `status=running`、`step=downloaded` 状态指令。
5. 用 Claude 正规步骤安装 skill 包。
6. 发送 `status=running`、`step=installed` 状态指令。
7. 按需刷新配置或重载运行时。
8. 校验目标 agent 仍然可用。
    - 校验失败 → 如实告知用户 → 发 `failed` 指令后结束。
9. 发送 `status=success` 状态指令（带 `target_agent_id`），再向用户汇报完成。

## 每次安装至少校验这些点

- 目标 agent 选对了
- 包已成功下载
- hash / manifest 校验通过（如果提供）
- 安装内容已经落到目标位置
- 目标 agent 安装后仍然可用

## 指令示例

进行中（下载完成）：

```text
[[egg-install-status|install_id=eggins_20370001|status=running|step=downloaded|summary=%E5%B7%B2%E4%B8%8B%E8%BD%BD%E5%B9%B6%E9%AA%8C%E8%AF%81%E5%AE%89%E8%A3%85%E5%8C%85]]
```

进行中（安装落位完成）：

```text
[[egg-install-status|install_id=eggins_20370001|status=running|step=installed|summary=%E5%AE%89%E8%A3%85%E5%86%85%E5%AE%B9%E5%B7%B2%E8%90%BD%E4%BD%8D%EF%BC%8C%E6%A0%A1%E9%AA%8C%E4%B8%AD]]
```

成功：

```text
[[egg-install-status|install_id=eggins_20370001|status=success|step=completed|target_agent_id=2035123456789012345|summary=%E5%B7%B2%E5%AE%8C%E6%88%90%E5%AE%89%E8%A3%85]]
```

失败（用户取消）：

```text
[[egg-install-status|install_id=eggins_20370001|status=failed|step=user_cancelled|error_code=user_cancelled|summary=%E7%94%A8%E6%88%B7%E5%8F%96%E6%B6%88%E5%AE%89%E8%A3%85]]
```

失败（目标不存在）：

```text
[[egg-install-status|install_id=eggins_20370001|status=failed|step=target_not_found|error_code=target_not_found|error_msg=%E6%8C%87%E5%AE%9A%E7%9A%84%20Claude%20agent%20%E4%B8%8D%E5%AD%98%E5%9C%A8|summary=%E5%AE%89%E8%A3%85%E5%A4%B1%E8%B4%A5]]
```

失败（下载失败）：

```text
[[egg-install-status|install_id=eggins_20370001|status=failed|step=download_failed|error_code=download_failed|error_msg=%E4%B8%8B%E8%BD%BD%E5%AE%89%E8%A3%85%E5%8C%85%E5%A4%B1%E8%B4%A5|summary=%E5%AE%89%E8%A3%85%E5%A4%B1%E8%B4%A5]]
```

## 回复风格

- 用正常对话回复用户
- 进度回报要短、明确、可执行
- 失败说明要具体
- 最终总结必须包含目标 agent 和安装结果
