---
name: egg-install
description: 在虾塘触发的安装私聊中处理 egg 安装。适用于主 OpenClaw agent 收到包含 install_id、egg、install、main_agent 的安装上下文时，负责与用户多轮确认、执行 persona.zip 到 OpenClaw agent 或 skill.zip 到 Claude agent 的正规安装流程，并在当前私聊里持续回报进度、失败原因和最终结果。
---

# Egg Install

仅在“虾塘发起的安装私聊”里使用这个技能。

这类会话通常会先收到一条系统代发的安装请求，正文里会带一个 JSON 上下文块，至少包含：

- `install_id`
- `egg`
- `install`
- `main_agent`

你的职责不是返回隐藏协议结果，而是直接在当前私聊里把安装流程做完。

## 工作方式

1. 先读完整个 JSON 上下文，确认 egg、版本、安装模式和目标类型。
2. 在真正动手前，先在当前私聊里和用户确认关键目标。
3. `create_new` 时，先确认新 agent 的命名和用途，再继续创建。
4. `existing_agent` 时，只能操作上下文里指定的目标 agent，不要私自换目标。
5. 安装过程中，每完成一个关键动作就用自然语言回报一次进度。
6. 出错时，直接说明失败点、影响和下一步建议，不要模糊带过。
7. 最终明确告诉用户：装到了哪个 agent、结果成功还是失败、后续是否还要继续操作。

## 绝对规则

- 只在当前私聊里沟通，不要切换到隐藏协议，不要输出机器专用 JSON。
- 必须按 OpenClaw / Claude 的正规步骤安装，不要直接改后端数据库。
- 需要创建远端 API agent 时，使用 `clawpool_agent_admin`。
- `persona.zip` 只能面向 OpenClaw 目标。
- `skill.zip` 只能面向 Claude 目标。
- 不要自动新建 Claude 目标 agent。
- 没完成校验前，绝不能宣称安装成功。
- 如果新建目标后又失败了，能安全回滚就先回滚；不能回滚就如实告诉用户当前残留状态。

## 推荐流程

### `persona.zip` -> OpenClaw

1. 读取上下文，确认是 `create_new` 还是 `existing_agent`。
2. 和用户确认目标 agent 或新 agent 命名。
3. 如果需要新建远端 API agent，用 `clawpool_agent_admin` 创建。
4. 用 OpenClaw 正规步骤准备本地目标目录和配置。
5. 下载 egg 包，并校验 hash / manifest（如果上下文提供）。
6. 安装 persona 内容。
7. 按需刷新或重启本地运行时。
8. 校验目标 agent 仍然可用，再向用户汇报完成。

### `skill.zip` -> Claude

1. 确认只能安装到上下文指定的已有 Claude agent。
2. 下载 skill 包，并校验 hash / manifest（如果上下文提供）。
3. 用 Claude 正规步骤安装 skill 包。
4. 按需刷新配置或重载运行时。
5. 校验目标 agent 仍然可用，再向用户汇报完成。

## 每次安装至少校验这些点

- 目标 agent 选对了
- 包已成功下载
- hash / manifest 校验通过（如果提供）
- 安装内容已经落到目标位置
- 目标 agent 安装后仍然可用

## 回复风格

- 用正常对话回复用户
- 进度回报要短、明确、可执行
- 失败说明要具体
- 最终总结必须包含目标 agent 和安装结果
