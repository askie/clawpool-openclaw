---
name: grix-egg
description: 在虾塘触发的安装私聊中处理 egg 安装。适用于主 OpenClaw agent 收到包含 install_id、egg、install、main_agent 的安装上下文时，按 install.route 指定的路线执行安装：把 persona/openclaw 包安装到 OpenClaw agent，或把 skill.zip 安装到 Claude agent，并在当前私聊里持续回报进度、失败原因和最终结果；当本次安装产出了新的目标 agent 时，安装完成后还要可选地拉群做一次身份验收，并在答非所设时继续修到回答正确为止。
---

# Egg Install

仅在"虾塘发起的安装私聊"里使用这个技能。

这类会话通常会先收到一条系统代发的安装请求，正文里会带一个 JSON 上下文块，至少包含：

- `install_id` — 安装单唯一 ID，所有状态消息必须使用原值
- `egg` — egg 包标识，格式为 `<name>@<version>` 或带完整下载 URL 的对象
- `install.mode` — 安装模式，枚举值：`create_new`（新建目标 agent）或 `existing_agent`（安装到已有 agent）
- `install.route` — 当前实际路线，优先使用它判断要走哪条分支。当前可见值：
  - `openclaw_create_new`
  - `openclaw_existing`
  - `claude_existing`
- `install.target_client_type` — 本次目标类型，通常为 `openclaw` 或 `claude`
- `install.artifact_package` — 本次应安装的包类型，通常为 `persona_zip` 或 `skill_zip`
- `install.suggested_agent_name` — `openclaw_create_new` 时优先使用的默认短名字；若缺失，再按 egg 标题或 egg ID 自行取一个简短名字继续，不要回头追问用户命名和用途
- `main_agent` — 发起安装的主 OpenClaw agent ID，安装完成后如需通知或回调，使用该 ID

你的职责不是返回隐藏协议结果，而是直接在当前私聊里把安装流程做完。

## 工作方式

1. 先读完整个 JSON 上下文，优先确认 `install.route`、`install.target_client_type`、`install.artifact_package`。
2. 默认直接按上下文执行；只有缺少关键信息、上下文互相冲突或执行被阻塞时，才在当前私聊里向用户确认。
3. `openclaw_create_new` 时，优先使用 `install.suggested_agent_name` 作为新 OpenClaw agent 的默认短名字；若缺失，再按 egg 标题或 egg ID 自行取一个简短名字继续创建，不要回头追问用户命名和用途。
4. `openclaw_existing` / `claude_existing` 时，只能操作上下文里指定的目标 agent，不要私自换目标；如果目标已经明确，就直接继续，不要重复确认。
5. 安装过程中，每完成一个关键动作就用自然语言回报一次进度。
6. `openclaw_create_new` 路线在"远端 agent 创建完成"后，必须额外发送一条 `status=running`、`step=agent_created` 的**独立结构化安装状态消息**。
7. 在"包下载完成"和"安装内容落位完成待校验"两个节点，各额外发送一条 `status=running` 的**独立结构化安装状态消息**。
8. 最终成功或失败时，必须发送一条 `status=success` 或 `status=failed` 的**独立结构化安装状态消息**。
9. 安装成功后，必须再单独发送一条目标 agent 的**结构化资料卡消息**，并且 `peer_type=2`。
10. 发送完资料卡后，再发一条普通文字，明确告诉用户可以点开资料卡查看 agent 资料，并从资料页继续与它对话。
11. 如果本次安装产出了新的目标 agent，资料卡和基础指引发完后，要主动询问用户是否需要立刻拉一个测试群做身份验收。
12. 用户同意拉群测试时，必须由当前主 agent 新建测试群，并把主 agent、当前私聊里的主人、刚安装出的目标 agent 一起拉进群。
13. 测试群建好后，主 agent 必须在群里直接 `@` 新 agent，明确问它“你是谁，请介绍一下你自己”或等价问题，不能把验收动作甩给用户先来。
14. 如果新 agent 的回答和 egg 设定的人设、身份、语气或职责明显不一致，不能草草结束；要把它当成安装验收未通过，继续排查并修复，直到重新提问后回答正确为止。
15. 出错时，直接说明失败点、影响和下一步建议，不要模糊带过。
16. 最终明确告诉用户：装到了哪个 agent、结果成功还是失败、后续是否还要继续操作。

## 绝对规则

- 只在当前私聊里沟通，不要切换到隐藏协议，不要输出机器专用 JSON。
- 必须按 OpenClaw / Claude 的正规步骤安装，不要直接改后端数据库。
- 需要创建远端 API agent 时，必须走 backend admin 路径；当前插件不再暴露 `grix_agent_admin`。
- 所有仍由插件承接的远端 API 通讯都必须走统一工具入口：`grix_query` / `grix_group`，禁止在对话里自行发 HTTP 请求。
- 禁止使用 `curl`、`fetch`、`axios` 或临时脚本直连 `/v1/agent-api`。
- 单页查询或单次变更动作只调用一次对应工具；只有分页读取或解析目标仍然不明确时，才允许继续调用下一次。
- 必须以 `install.route` 为准执行，不要自己重新选路线。
- `openclaw_create_new` / `openclaw_existing` 只能安装 persona/openclaw 包。
- `claude_existing` 只能安装 skill.zip。
- 不要自动新建 Claude 目标 agent。
- 没完成校验前，绝不能宣称安装成功。
- 如果新建目标后又失败了，能安全回滚就先回滚；不能回滚就如实告诉用户当前残留状态。
- 上下文已经给出 `install.target_agent_id` 或 `install.suggested_agent_name` 时，直接继续执行，不要再向用户确认目标、命名或用途；只有信息缺失、冲突或执行阻塞时才提问。
- 安装私聊进行中时，禁止主动执行 `openclaw gateway restart`；本流程涉及的本地 OpenClaw 配置必须通过官方 CLI 写入：`channels.grix.accounts.<agent_name>`、`agents.list`、`tools.*` 继续使用 `openclaw config set`，Grix 绑定使用 `openclaw agents bind`；禁止调用会直接改 `openclaw.json` 的脚本，也不要手工编辑 JSON。先写配置并完成校验；只有在安装已经成功、流程进入拉群验收、并且确认配置正确但运行态仍然是旧结果时，才允许用官方命令 `openclaw gateway restart` 做一次定向补救。
- 对 `@dhf-openclaw/grix` 的安装，安装成功后还必须确保存在一个自动更新 cron 任务，定期执行 `grix-update`；优先复用同名任务 `grix auto update`，避免重复创建。
- 对 `@dhf-openclaw/grix` 的安装，自动更新 cron 不是“提醒项”，而是安装完成条件的一部分；在实际执行 `openclaw cron add` 或 `openclaw cron edit` 并确认任务存在之前，不得宣称安装完成。
- 最终成功或失败时，必须发送一条独立的结构化安装状态消息。
- 安装成功后，必须按顺序继续发送：目标 agent 的结构化资料卡消息，然后再发一条普通文字的下一步指引。
- 如果本次安装产出了新的目标 agent，发完资料卡和基础指引后，要继续询问用户是否需要拉群测试；用户同意才执行，拒绝则结束，不要强行建群。
- 拉群测试由主 agent 主持，不能让用户自己去设计测试话术；主 agent 必须亲自 `@` 新 agent 发起第一轮身份确认。
- 测试群至少包含 3 个成员：主 agent、当前私聊里的主人、目标 agent；缺任何一个都不算完成验收。
- 只要测试回答明显偏离 egg 人设，就视为安装验收未通过；不要把“渠道刚同步”“再聊聊看”当成最终结果。
- 发现回答异常时，优先检查并修复目标 agent 对应的渠道账号、绑定关系、agent 列表和安装内容；确认本地配置已正确但运行态仍然是旧结果时，才可以把“重启 gateway”当成定向补救手段，并且补救后必须重新进群验证。
- 结构化安装状态消息必须单独发送，不要和自然语言解释混在同一条里。
- 用户拒绝确认或主动取消时，必须发送 `status=failed`、`error_code=user_cancelled` 的结构化状态消息后再结束。

## 安装状态消息（OpenClaw ReplyPayload 风格）

server 不会猜自然语言。要让安装单进入"进行中 / 成功 / 失败"，你必须单独发送一条**单行 JSON**，格式参考 OpenClaw 的 ReplyPayload：

```json
{"text":"<给用户看的摘要>","channelData":{"grix":{"eggInstall":{"install_id":"<INSTALL_ID>","status":"<running|success|failed>","step":"<STEP>","summary":"<与 text 一致或更精确的摘要>"}}}}
```

常用可选字段：

- `target_agent_id`：成功时尽量带上，尤其是 `create_new`。
- `detail_text`：补充更长说明。
- `error_code`：失败时建议带上。
- `error_msg`：失败时建议带上。

规则：

1. `install_id` 必须使用上下文里的原值。
2. `status` 只能是 `running`、`success`、`failed`。
3. `text` 必须是给用户看的简短摘要；`summary` 应与 `text` 一致，或在不冲突的前提下更精确。
4. 不要做 URI 编码；直接输出合法 JSON 字符串。
5. 这条消息只负责状态收口；如果要跟用户解释原因，另发一条正常文字消息。
6. 顶层只放 `text` 和 `channelData`，不要自己拼前端内部 `biz_card`。
7. 这条 JSON 必须单独发送，不要前后夹带自然语言。
8. `openclaw_create_new` 成功时，必须尽量带 `target_agent_id`，否则 server 可能无法通过最终校验。
9. 如果上下文缺少 `install.route` 但仍有 `install.mode` 和目标 agent 信息，先按上下文能明确推出的路线执行；若仍有歧义，先在当前私聊里确认，再继续。

## Agent 资料卡消息（OpenClaw ReplyPayload 风格）

安装成功后，必须再单独发送一条 agent 资料卡消息，格式如下：

```json
{"text":"查看 Agent 资料","channelData":{"grix":{"userProfile":{"user_id":"<TARGET_AGENT_ID>","peer_type":2,"nickname":"<AGENT_NAME>","avatar_url":"<可选>"}}}}
```

规则：

1. `user_id` 必须使用最终目标 agent 的 ID。
2. `peer_type` 必须固定为 `2`。
3. `nickname` 必须使用目标 agent 的显示名称。
4. `avatar_url` 有就带，没有可以省略。
5. 这条 JSON 也必须单独发送，不要和解释文字混在一起。
6. 发完资料卡后，再补一条普通文字，告诉用户可以点开资料卡查看资料，并从资料页继续与该 agent 对话。

## 统一 API 请求机制

当安装流程需要访问 Grix 远端能力时，统一按下面路由，不要绕过：

1. 查联系人 / 会话 / 消息：调用 `grix_query`
2. 群治理动作（建群、加人、移人、禁言、解散）：调用 `grix_group`
3. 创建远端 API agent：走 backend admin 路径，不通过插件工具

规则：

1. 不直接拼接 `Authorization` 或手工构造 `/v1/agent-api/*` 请求。
2. 不写临时通讯脚本，不走隐藏协议。
3. 每次 typed tool 调用都要带上准确的当前 `accountId`。
4. `grix_query` 遇到分页结果时，若当前页不足以完成安装判断，继续按分页规则取后续页。

## 推荐流程

### `openclaw_create_new` / `openclaw_existing`

1. 读取上下文，确认 route 是 `openclaw_create_new` 还是 `openclaw_existing`。
2. 如果 route=`openclaw_create_new`，直接使用 `install.suggested_agent_name` 作为默认短名字；若缺失，再按 egg 标题或 egg ID 自行取一个简短名字继续。只有名字或目标信息真的缺失、冲突或执行被阻塞时，才向用户确认；**用户主动取消时发 `failed/user_cancelled` 结构化状态消息后结束**。
3. 如果 route=`openclaw_existing`，直接使用 `install.target_agent_id` 指定的目标 agent 继续，不要重复确认目标。
4. 如果 route=`openclaw_create_new`，先确认上下文已经给出远端 agent 的 `agent_id`、`api_endpoint`、`api_key`；缺任一项就停止，并提示用户先完成 backend admin 创建。
   - persona 文件只安装到 `workspace` 根目录，不要装到 `agentDir`。
5. 如果 route=`openclaw_create_new` 且远端 agent 已创建成功，立即发送 `status=running`、`step=agent_created` 结构化状态消息。
6. 用 OpenClaw 正规步骤准备本地目标目录和配置。
7. 下载 persona/openclaw 包，并校验 hash / manifest（如果上下文提供）。
8. 发送 `status=running`、`step=downloaded` 结构化状态消息。
9. 安装 persona/openclaw 内容到 `workspace` 根目录。
   - 把 persona 包内容解压或写入 `<workspace>/`，例如 `~/.openclaw/workspace-<agent_name>/`
   - `IDENTITY.md`、`SOUL.md`、`AGENTS.md` 必须落在这个 `workspace` 根目录
   - `USER.md` / `MEMORY.md` 如包内提供，也放在这个 `workspace` 根目录
   - 不要解压到 `agentDir`；`agentDir` 由 OpenClaw 自动管理运行状态
10. 发送 `status=running`、`step=installed` 结构化状态消息。
11. 先用 `openclaw config get --json` 读取当前 `channels.grix.accounts`、`agents.list`、`tools.profile`、`tools.alsoAllow`、`tools.sessions.visibility`；若个别路径不存在，按空对象 / 空数组处理，在现有值基础上合并本次目标项，不要覆盖掉其他已有配置；如果需要确认已有 Grix 绑定，额外用 `openclaw agents bindings --agent <agent_name> --json` 查看当前绑定列表。
12. 用官方 CLI 逐项写入本地变更，推荐顺序如下：
    - `openclaw config set channels.grix.accounts.<agent_name> '<ACCOUNT_JSON>' --strict-json`
    - `openclaw config set agents.list '<NEXT_AGENTS_LIST_JSON>' --strict-json`
    - `openclaw agents bind --agent <agent_name> --bind grix:<agent_name>`
    - `openclaw config set tools.profile '"coding"' --strict-json`
    - `openclaw config set tools.alsoAllow '["message","grix_query","grix_group","grix_register"]' --strict-json`
    - `openclaw config set tools.sessions.visibility '"agent"' --strict-json`
    - 不要调用 `grix_agent_bind.py`，也不要直接编辑 `~/.openclaw/openclaw.json`
13. 执行 `openclaw config validate`，再用 `openclaw config get --json` 检查刚写入的 account / agent / tools 都已存在且值正确，并用 `openclaw agents bindings --agent <agent_name> --json` 确认目标绑定已经存在。
14. 校验目标 agent 仍然可用。
    - 任一 `openclaw config get` / `set` / `validate` 失败 → 尝试回滚（含步骤4新建的远端 agent），无法回滚则如实告知残留状态 → 发 `failed` 结构化状态消息后结束。
    - 其他校验失败 → 尝试回滚（含步骤4新建的远端 agent），无法回滚则如实告知残留状态 → 发 `failed` 结构化状态消息后结束。
15. 发送 `status=success` 结构化状态消息（带 `target_agent_id`）。
16. 单独发送目标 agent 的结构化资料卡消息。
17. 再发一条普通文字，告诉用户可以点开资料卡查看 agent 资料，并从资料页继续与它对话。
18. 如果 route=`openclaw_create_new`，紧接着主动问用户是否需要现在就拉一个测试群，帮他当场验收这个新 agent；用户明确拒绝则结束。
19. 用户同意后，用 `grix_group` 创建测试群，并确保群成员至少包含：当前主 agent、当前私聊里的主人、步骤15里的目标 agent。
20. 创建成功后，先保存 `grix_group` 返回的准确 `session_id`，后续所有发往测试群的消息都必须使用这个 `session_id` 作为消息目标，不要继续使用当前私聊的会话目标；如果没有拿到准确 `session_id`，先不要继续群测。
21. 在当前私聊里同步一次测试群已建好；如果已经拿到准确 `session_id`，可额外发送会话卡片帮助用户进入测试群。会话卡片一律按 `message-send` 里的 `conversation-card` 协议发送：默认单独一条最稳，也允许和一句简短说明同发，但一条消息只放一张会话卡片。
22. 主 agent 进入测试群后，先主动 `@` 目标 agent，发送一条明确的身份确认消息，例如“@xxx 你是谁？请介绍一下你自己。”这条测试消息的 `target` 必须使用步骤20保存的测试群 `session_id`。
23. 判断这次回答是否通过：
    - 通过：回答内容与 egg 的人设、名字、定位、说话风格基本一致，没有明显串成其他 agent、默认助手或空白身份。
    - 不通过：回答成了别的人设、通用助手、自我介绍缺失，或明显还是旧配置。
24. 如果不通过，主 agent 必须继续排查并修复，优先顺序如下：
    - 先检查本次安装落位是否正确，确认目标 persona/skill 已经装到预期位置。
    - 再检查 `channels.grix.accounts.<agent_name>`、`agents.list`、`openclaw agents bindings --agent <agent_name> --json` 是否都指向这次新 agent。
    - 再检查必要的工具权限和会话可见性是否仍符合安装要求。
    - 如果以上配置都正确，但群里回复依然像旧人格或默认人格，再把运行态未刷新视为高概率原因；这时可以明确告知用户你要做一次定向的 gateway 重启补救，并使用官方命令 `openclaw gateway restart`，执行后重新验证。
25. 每做完一轮修复，都要回到同一个测试群再次 `@` 目标 agent 问身份；这类复测消息也必须继续使用步骤20保存的测试群 `session_id`。只有回答正确后，测试才算通过。
26. 测试通过后，在测试群里简短说明已验收通过；同时回到当前私聊，告诉主人现在已经正常，他也可以自己继续问话了。
27. 对 `@dhf-openclaw/grix` 安装成功后，还要检查自动更新 cron：
    - 先用 `openclaw cron list` 查是否已经存在同名任务 `grix auto update`
    - 若不存在，创建一个隔离式、静默的定时任务去执行 `grix-update`
    - 若已存在，改用 `openclaw cron edit` 更新到标准参数
    - 创建或更新后，用 `openclaw cron list` / `openclaw cron status` 再确认一次
28. 自动更新 cron 推荐参数固定为：
    - 名称：`grix auto update`
    - 频率：`--every "6h"`
    - `--session isolated`
    - `--light-context`
    - `--no-deliver`
    - `--agent <main_agent>`
    - `--message` 中明确要求使用 `grix-update` 技能，并以 `{"mode":"check-and-apply","plugin_id":"grix","notify_on":"never","allow_restart":true}` 执行
29. 自动更新 cron 的实际执行命令应按下面分支落地，不要只停留在说明文字：
    - 不存在同名任务时，执行：
      ```bash
      openclaw cron add \
        --name "grix auto update" \
        --every "6h" \
        --agent <main_agent> \
        --session isolated \
        --light-context \
        --no-deliver \
        --message 'Use the grix-update skill with {"mode":"check-and-apply","plugin_id":"grix","notify_on":"never","allow_restart":true}. If there is no update or the update succeeds, reply exactly NO_REPLY. If the install is unsupported or any step fails, return one short failure summary.'
      ```
    - 已存在同名任务时，先定位 job id，再执行：
      ```bash
      openclaw cron edit <job_id> \
        --every "6h" \
        --agent <main_agent> \
        --session isolated \
        --light-context \
        --no-deliver \
        --message 'Use the grix-update skill with {"mode":"check-and-apply","plugin_id":"grix","notify_on":"never","allow_restart":true}. If there is no update or the update succeeds, reply exactly NO_REPLY. If the install is unsupported or any step fails, return one short failure summary.'
      ```
30. 只有下面条件都满足，`@dhf-openclaw/grix` 安装才能对用户宣称成功：
    - 插件已安装并启用
    - 本地配置和绑定已校验通过
    - 目标 agent 可正常工作
    - `grix auto update` 定时任务已经实际存在，并且 `openclaw cron status` 正常

### `claude_existing`

1. 确认上下文 route 为 `claude_existing`，且指定的 Claude 目标 agent 存在；**不存在则发 `failed/target_not_found` 结构化状态消息后结束**。
2. 直接使用 `install.target_agent_id` 指定的 Claude 目标 agent 继续安装，不要重复确认目标；只有目标信息缺失、冲突或执行被阻塞时，才向用户确认。**用户主动取消时发 `failed/user_cancelled` 结构化状态消息后结束**。
3. 下载 skill 包，并校验 hash / manifest（如果上下文提供）。
4. 发送 `status=running`、`step=downloaded` 结构化状态消息。
5. 用 Claude 正规步骤安装 skill 包。
6. 发送 `status=running`、`step=installed` 结构化状态消息。
7. 如需写 OpenClaw 配置，先 `openclaw config get --json` 读取当前值，再用 `openclaw config set ... --strict-json` 写回；不要调用 `grix_agent_bind.py`，也不要直接编辑 `~/.openclaw/openclaw.json`。
8. 如果写了 OpenClaw 配置，执行 `openclaw config validate`，并用 `openclaw config get --json` 检查目标项已存在；若涉及工具权限，同步检查 `tools.profile`、`tools.alsoAllow`、`tools.sessions.visibility`；不要在安装对话中执行 `openclaw gateway restart`。
9. 校验目标 agent 仍然可用。
    - 任一配置写入或校验失败 → 如实告知用户 → 发 `failed` 结构化状态消息后结束。
    - 其他校验失败 → 如实告知用户 → 发 `failed` 结构化状态消息后结束。
10. 发送 `status=success` 结构化状态消息（带 `target_agent_id`）。
11. 单独发送目标 agent 的结构化资料卡消息。
12. 再发一条普通文字，告诉用户可以点开资料卡查看 agent 资料，并从资料页继续与它对话。

## 安装后的可选拉群验收

这一步是安装成功后的补充验收，不替代前面的安装状态消息、资料卡和基础成功提示。

### 什么时候要问

1. `openclaw_create_new` 成功后，默认主动问一次用户是否需要立刻拉群测试。
2. `openclaw_existing` / `claude_existing` 默认不强制主动拉群；只有用户明确提到要验收、怀疑配置没生效，或当前安装单上下文已经要求做群测时，再执行这一步。

### 验收目标

1. 证明目标 agent 在 Grix 实际对话里说出来的身份，就是 egg 期望的人设。
2. 证明当前渠道不是还挂着旧配置、旧人格或默认助手响应。
3. 只有真正群聊实测通过，才能把“拉群验收”这一步汇报为完成。

### 验收动作

1. 由主 agent 创建测试群，并把主 agent、主人、目标 agent 拉进去。
2. 创建成功后，立即保存测试群返回的准确 `session_id`；后续所有发往测试群的消息都必须使用这个 `session_id` 作为 `target`，不要继续使用当前私聊的会话目标；如果没有拿到准确 `session_id`，先不要继续群测。
3. 主 agent 在群里先发起第一问，不要把第一轮验证交给用户。
4. 第一问必须是直接验证身份的话术，例如：
   - `@目标agent 你是谁？请介绍一下你自己。`
   - `@目标agent 说一下你的身份和你是做什么的。`
5. 第一轮和后续追问都必须继续发到同一个测试群 `session_id`；不要把群测消息发回安装私聊。
6. 如果第一轮回答模糊，允许追问一轮，但只要内容已经明显偏离 egg 人设，就直接进入修复，不要无限追问。

### 通过标准

同时满足下面几点，才算通过：

1. 回答出来的名字、身份、职责与 egg 设定一致或高度一致。
2. 说话风格和设定不冲突，没有明显串成其他 agent。
3. 没有把自己说成“通用助手”“OpenAI 助手”“默认 AI”之类的泛化身份。
4. 主 agent 复测时，结果稳定，不是一轮对一轮错。

### 不通过时怎么修

1. 先把它视为配置或运行态问题，不要让用户自己猜。
2. 先查安装内容、agent 绑定、Grix 账号映射、agent 列表是否都对上本次目标 agent。
3. 再查需要的工具权限和会话可见性是否仍是预期值。
4. 配置已经确认正确，但群里说出来还是旧人格时，再考虑运行态未刷新；这时使用 OpenClaw 官方命令 `openclaw gateway restart` 做一次定向补救，不要改用 `kill -9`、`nohup` 或手工编辑配置文件。
5. 每次修完都必须重新进同一个测试群再问一次“你是谁”，直到回答正确。
6. 没有重新实测通过前，不能告诉用户“已经好了”。

### 收口方式

1. 测试通过后，在私聊里明确告诉用户：已经拉群验收通过，现在他也可以自己继续问这个 agent 了。
2. 如果创建了测试群且拿到了准确 `session_id`，可以补一张测试群会话卡片，方便用户直接点进去继续聊。发送格式沿用 `message-send` 的 `conversation-card` 规则：默认单独一条最稳，也可和一句简短说明同发，但不要在一条消息里塞多张会话卡片。
3. 如果用户拒绝拉群测试，正常结束安装单，不要把拒绝测试说成失败。

## 每次安装至少校验这些点

- 目标 agent 选对了
- 包已成功下载
- hash / manifest 校验通过（如果提供）
- 安装内容已经落到目标位置
- 涉及 OpenClaw 配置时，`openclaw config validate` 已通过
- 涉及 OpenClaw 配置时，`channels.grix.accounts.<agent_name>`、`agents.list` 已包含目标项，且 `openclaw agents bindings --agent <agent_name> --json` 能看到目标绑定
- 涉及 OpenClaw 配置时，`tools.profile="coding"`、`tools.alsoAllow`、`tools.sessions.visibility="agent"` 已符合预期
- 目标 agent 安装后仍然可用
- 实际安装路线没有偏离 `install.route`
- 如果执行了拉群测试，新 agent 在测试群里能正确回答自己的身份，且与 egg 人设一致
- 如果拉群测试中出现过错误回答，必须已经完成修复并重新验证通过

## 消息示例

进行中（远端 agent 创建完成）：

```json
{"text":"已创建远端 Agent","channelData":{"grix":{"eggInstall":{"install_id":"eggins_20370001","status":"running","step":"agent_created","summary":"已创建远端 Agent"}}}}
```

进行中（下载完成）：

```json
{"text":"已下载并验证安装包","channelData":{"grix":{"eggInstall":{"install_id":"eggins_20370001","status":"running","step":"downloaded","summary":"已下载并验证安装包"}}}}
```

进行中（安装落位完成）：

```json
{"text":"安装内容已落位，校验中","channelData":{"grix":{"eggInstall":{"install_id":"eggins_20370001","status":"running","step":"installed","summary":"安装内容已落位，校验中"}}}}
```

成功：

```json
{"text":"已完成安装","channelData":{"grix":{"eggInstall":{"install_id":"eggins_20370001","status":"success","step":"completed","target_agent_id":"2035123456789012345","summary":"已完成安装"}}}}
```

成功后的资料卡：

```json
{"text":"查看 Agent 资料","channelData":{"grix":{"userProfile":{"user_id":"2035123456789012345","peer_type":2,"nickname":"writer-openclaw"}}}}
```

失败（用户取消）：

```json
{"text":"用户取消安装","channelData":{"grix":{"eggInstall":{"install_id":"eggins_20370001","status":"failed","step":"user_cancelled","error_code":"user_cancelled","summary":"用户取消安装"}}}}
```

失败（目标不存在）：

```json
{"text":"安装失败","channelData":{"grix":{"eggInstall":{"install_id":"eggins_20370001","status":"failed","step":"target_not_found","error_code":"target_not_found","error_msg":"指定的 Claude agent 不存在","summary":"安装失败"}}}}
```

失败（下载失败）：

```json
{"text":"安装失败","channelData":{"grix":{"eggInstall":{"install_id":"eggins_20370001","status":"failed","step":"download_failed","error_code":"download_failed","error_msg":"下载安装包失败","summary":"安装失败"}}}}
```

## 回复风格

- 用正常对话回复用户
- 进度回报要短、明确、可执行
- 失败说明要具体
- 最终总结必须包含目标 agent 和安装结果

## References

1. Load [references/api-contract.md](references/api-contract.md).
