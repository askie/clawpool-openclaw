# Grix 插件对接的 OpenClaw 协议 / 命令与 AIBot 映射

> 更新时间：2026-04-08  
> 状态：已落地  
> 适用范围：`index.ts`、`src/channel.ts`、`src/group-adapter.ts`、`src/group-tool-policy.ts`、`src/monitor.ts`、`src/client.ts`、`src/actions.ts`、`src/channel-exec-approvals.ts`、`src/local-actions.ts`、`src/admin/*`

这篇文档只回答一件事:

1. `grix` 插件在 OpenClaw 侧到底接了哪些协议能力、命令入口和工具入口
2. 这些入口最终被翻译成了 AIBot WebSocket 的什么命令
3. 哪些能力没有走聊天通道，而是走了本地配置读取

---

## 1. 先看总表

| OpenClaw 侧入口 | 插件里的落点 | 下游协议 |
|---|---|---|
| Channel 插件 `grix` | `src/channel.ts` | AIBot WebSocket |
| 消息动作 `unsend` / `delete` | `src/actions.ts` | AIBot WebSocket |
| Exec Approval 展示适配 | `src/channel-exec-approvals.ts` | AIBot WebSocket |
| Exec Approval 本地动作执行 | `src/local-actions.ts` | AIBot WebSocket (`local_action`) + 本地 OpenClaw Gateway 命令 |
| 群聊接收规则（mention gate / intro hint / tool policy） | `src/group-adapter.ts` / `src/group-tool-policy.ts` | OpenClaw 内部 `groups` hook，不走 AIBot |
| 工具 `grix_query` | `src/admin/query-tool.ts` | AIBot WebSocket (`agent_invoke`) |
| 工具 `grix_group` | `src/admin/group-tool.ts` | AIBot WebSocket (`agent_invoke`) |
| CLI `openclaw grix doctor` | `src/admin/cli.ts` | 本地配置读取，不走 AIBot |
| Hook `before_prompt_build` | `index.ts` | OpenClaw 内部 Hook，不走 AIBot |

结论先说清楚:

1. 真正和 AIBot 直连的是聊天收发、流式回复、撤回、停止、审批卡片这些通道能力
2. `grix_query`、`grix_group` 已经走统一的 AIBot WebSocket 请求-响应
3. 插件没有把 Grix 收到的普通文本当成 OpenClaw 原生命令解析；审批也不再在插件里解析，改由 backend 转成标准 `local_action`
4. 群聊的通用提示、可见性开关和工具限制仍然在插件本地实现，但这属于 OpenClaw 内部 hook，不对应额外的 AIBot 协议命令

---

## 2. OpenClaw Channel 能力映射到 AIBot 什么协议

`index.ts` 里通过 `api.registerChannel({ plugin: aibotPlugin })` 把 `grix` 注册成 OpenClaw 的一个 Channel。

`src/channel.ts` 里声明的主要能力如下：

| OpenClaw Channel 能力 | 当前实现 | AIBot 侧协议 / 命令 |
|---|---|---|
| 直聊 / 群聊 | `chatTypes: ["direct", "group"]` | 入站 `event_msg`，出站 `send_msg` |
| 媒体发送 | `media: true` | `send_msg`，媒体消息带 `media_url` |
| 反应能力声明 | `reactions: true` | 仅接收 `event_react` 回调，当前没有继续翻译成 OpenClaw 业务动作 |
| 撤回 / 删除 | `unsend: true` | `delete_msg` |
| 原生命令 | `nativeCommands: false` | 不把普通 Grix 文本当成 OpenClaw slash/bang 命令 |
| 分块流式 | `blockStreaming: false` | 不走 block 流；改走 `client_stream_chunk` |

这里最重要的一点是:

1. OpenClaw 的文本流式回复没有直接映射成 AIBot 的“块流”
2. 插件强制使用连续文本快照，再转成 AIBot 的 `client_stream_chunk`

另外，`src/channel.ts` 里还有三项群聊内部 hook，它们不直接映射 AIBot 协议：

| OpenClaw groups hook | 当前实现 | 对外效果 |
|---|---|---|
| `resolveRequireMention()` | `false` | 群聊不做硬 mention 门槛 |
| `resolveGroupIntroHint()` | `src/group-adapter.ts` | 给模型一段静态群聊总提示 |
| `resolveToolPolicy()` | `src/group-tool-policy.ts` | 群聊里默认禁用主动 `message` 工具 |

---

## 3. AIBot 入站命令，插件怎么翻给 OpenClaw

### 3.1 连接与保活层

| AIBot 命令 | 方向 | 插件处理 | 说明 |
|---|---|---|---|
| `auth` | 插件 -> AIBot | `src/client.ts` | 建连后先发鉴权 |
| `auth_ack` | AIBot -> 插件 | `src/client.ts` | 返回鉴权结果和 `heartbeat_sec` |
| `ping` | AIBot -> 插件 | `src/client.ts` | 插件立刻回 `pong` |
| `pong` | 插件 -> AIBot | `src/client.ts` | 保活响应 |
| `kicked` | AIBot -> 插件 | `src/client.ts` | 当前连接被服务端踢掉，插件触发重连 |

### 3.2 聊天事件层

| AIBot 入站命令 | 插件处理 | 对应 OpenClaw 侧动作 | 插件回给 AIBot 的命令 |
|---|---|---|---|
| `event_msg` | `src/monitor.ts` `processEvent(...)` | 组装 `ctxPayload`，写入会话上下文，调用 OpenClaw 回复分发 | 先 `event_ack`，结束后 `event_result` |
| `event_stop` | `src/monitor.ts` `handleEventStop(...)` | 中止当前 reply run | 先 `event_stop_ack`，结束后 `event_stop_result` |
| `event_revoke` | `src/monitor.ts` `onEventRevoke` | 转成 OpenClaw 侧撤回系统事件 | `event_ack` |
| `event_react` | `src/client.ts` 回调透出 | 目前只保留入口，没有继续翻成插件业务动作 | 无专门回包 |
| `local_action` | `src/monitor.ts` `handleStableLocalAction(...)` | 执行 backend 下发的稳定本地动作（如审批） | `local_action_result` |

### 3.3 `event_msg` 具体被翻成什么 OpenClaw 输入

`event_msg` 是最核心的入站协议。插件会把它翻成 OpenClaw 的这类上下文信息：

| AIBot 字段 | OpenClaw 侧用途 |
|---|---|
| `session_id` | 路由到 OpenClaw `sessionKey` |
| `msg_id` | 作为当前消息标识、回复锚点 |
| `content` | 进入 `Body` / `BodyForAgent` / `RawBody` |
| `quoted_message_id` | 进入 `ReplyToMessageSid` |
| `context_messages` | 作为当前轮待注入近场上下文 |
| `sender_id` | 进入 `From`、`SenderId`、`SenderName` |
| `event_type` / `mention_user_ids` | 推断群聊语义、是否点名 |

同时插件明确做了这件事:

1. `BodyForCommands` 被置空
2. 普通 Grix 文本不会按 OpenClaw 原生命令去解析

也就是说，用户发到 Grix 的普通聊天内容，默认都按“自然语言聊天消息”处理。

---

## 4. OpenClaw 出站回复，被翻成 AIBot 什么命令

### 4.1 普通文本、媒体、结构化回复

| OpenClaw 侧输出 | 插件中转 | AIBot 命令 | 说明 |
|---|---|---|---|
| 普通文本 `sendText` | `src/channel.ts` / `src/client.ts` | `send_msg` | `msg_type=1`，正文放 `content` |
| 媒体 `sendMedia` | `src/channel.ts` / `src/client.ts` | `send_msg` | 默认 `msg_type=2`，媒体地址放 `media_url` |
| 通用 payload `sendPayload` | `src/channel.ts` / `src/aibot-payload-delivery.ts` | `send_msg` | 插件先把 payload 展平成文本/卡片，再发给 AIBot |
| 引用回复 | `replyToId` -> `quoted_message_id` | `send_msg` | 把 OpenClaw 回复锚定到触发消息 |

### 4.2 流式回复

| OpenClaw 侧机制 | 插件转换方式 | AIBot 命令 |
|---|---|---|
| `replyOptions.disableBlockStreaming = true` | 关闭 block 分段流 | 不直接对应命令，是插件内部策略 |
| `replyOptions.onPartialReply` | 取得连续文本快照 | `client_stream_chunk` |
| 连续快照差分 | 只发送新增后缀 | `client_stream_chunk` |
| 流结束 | 最后一包 `is_finish=true` | `client_stream_chunk` |

也就是说，OpenClaw 的流式回复在 AIBot 侧最终不是多条独立消息，而是:

1. 同一个 `client_msg_id`
2. 多次 `client_stream_chunk`
3. 最后一包带 `is_finish=true`

### 4.3 会话状态与路由辅助命令

| 插件动作 | AIBot 命令 | 用途 |
|---|---|---|
| 记录 OpenClaw `sessionKey -> session_id` | `session_route_bind` | 把 OpenClaw 会话路由绑回 AIBot 会话 |
| 出站前按 `to` 解析真实会话 | `session_route_resolve` | 支持 OpenClaw 用 `route.sessionKey` 回发消息 |
| 回复生成中显示输入状态 | `session_activity_set` | 当前只发送 `kind: "composing"` |
| 接收新消息后确认收到 | `event_ack` | 告诉 AIBot 事件已接收 |
| 当前轮处理完成 | `event_result` | 告诉 AIBot 这轮已响应 / 失败 / 取消 |
| 停止请求已接收 | `event_stop_ack` | 停止流程第一阶段确认 |
| 停止请求最终结果 | `event_stop_result` | 停止流程最终状态 |

### 4.4 AIBot 对插件请求的标准回包

下面这些不是业务事件，而是插件主动发命令时 AIBot 回给它的标准回包：

| AIBot 回包 | 插件在哪里消费 |
|---|---|
| `send_ack` | `send_msg`、`client_stream_chunk` 结束包、`delete_msg`、路由绑定/解析 |
| `send_nack` | 同上，作为失败回包 |
| `error` | 同上，作为失败回包 |
| `agent_invoke_result` | `src/client.ts` `agentInvoke()`，作为管理工具的请求-响应结果 |

---

## 5. OpenClaw 消息动作，被映射成 AIBot 什么命令

`src/actions.ts` 把 OpenClaw 的消息动作适配成了两个可发现动作：

| OpenClaw 消息动作 | 插件处理 | AIBot 命令 | 备注 |
|---|---|---|---|
| `unsend` | 先解目标，再删目标消息 | `delete_msg` | 如果需要，会顺手删掉执行这次撤回的命令消息 |
| `delete` | 先解目标，再删目标消息 | `delete_msg` | 目前底层命令与 `unsend` 一样 |

这里有两个额外约束：

1. `describeMessageTool` 暴露给 OpenClaw 的动作只有 `unsend` 和 `delete`
2. `unsend` 被当成“静默清理动作”，插件提示 agent 结束时返回 `NO_REPLY`

---

## 6. Exec Approval 是怎么桥接的

这一块不是单一协议，而是三段桥接：

1. OpenClaw 产出审批请求
2. 插件把它变成 AIBot 可展示的审批卡片
3. backend 把用户在 Grix 里的审批输入转成 `local_action`，插件执行后回 `local_action_result`

### 6.1 OpenClaw -> AIBot

| OpenClaw 侧能力 | 插件转换结果 | AIBot 落点 |
|---|---|---|
| `channel.execApprovals.buildPendingPayload` | 生成 `exec_approval` 卡片 | `send_msg` |
| `channel.execApprovals.buildResolvedPayload` | 生成 `exec_status` 卡片 | `send_msg` |
| `shouldSuppressLocalPrompt` | 本地不再额外弹重复审批提示 | AIBot 聊天面板承担展示 |

### 6.2 Backend 下发的审批动作 -> OpenClaw Gateway

插件不再解析聊天里的 `/approve` 或 `[[exec-approval-resolution|...]]`。这些输入先由 backend 识别，再转换成标准本地动作下发给插件：

| AIBot 入站命令 | 插件动作 | OpenClaw 侧命令 |
|---|---|---|
| `local_action` (`exec_approve`) | `handleStableLocalAction(...)` | `openclaw gateway call exec.approval.resolve --json --params ...` |
| `local_action` (`exec_reject`) | `handleStableLocalAction(...)` | 同上 |

动作执行完成后，插件会：

1. 回 `local_action_result`
2. 由 backend 统一把审批结果回写到当前会话

---

## 7. OpenClaw 结构化回复，被包装成了哪些 AIBot 卡片

这些内容底层仍然是 AIBot 的 `send_msg`，只是 `extra` 里带了 `biz_card` 和 `channel_data`：

| OpenClaw 侧 payload 特征 | 插件卡片类型 | AIBot 发送方式 |
|---|---|---|
| `channelData.execApproval + channelData.grix.execApproval` | `exec_approval` | `send_msg` |
| `channelData.grix.execStatus` | `exec_status` | `send_msg` |
| `channelData.grix.eggInstall` | `egg_install_status` | `send_msg` |
| `channelData.grix.userProfile` | `user_profile` | `send_msg` |
| `channelData.grix.toolExecution` | `tool_execution` | `send_msg` |

可以把它理解成：

1. AIBot 协议层面还是发消息
2. 只是消息 `extra` 被插件包装成了业务卡片

---

## 8. OpenClaw 工具和 CLI 映射到什么下游命令

这一部分说明工具和 CLI 现在各自走哪条线。

### 8.1 `grix_query`

| OpenClaw 工具 | action | 下游 actionName | 下游协议 |
|---|---|---|---|
| `grix_query` | `contact_search` | `contact_search` | `agent_invoke` |
| `grix_query` | `session_search` | `session_search` | `agent_invoke` |
| `grix_query` | `message_history` | `message_history` | `agent_invoke` |
| `grix_query` | `message_search` | `message_search` | `agent_invoke` |

### 8.2 `grix_group`

| OpenClaw 工具 | action | 下游 actionName | 下游协议 |
|---|---|---|---|
| `grix_group` | `create` | `group_create` | `agent_invoke` |
| `grix_group` | `detail` | `group_detail_read` | `agent_invoke` |
| `grix_group` | `leave` | `group_leave_self` | `agent_invoke` |
| `grix_group` | `add_members` | `group_member_add` | `agent_invoke` |
| `grix_group` | `remove_members` | `group_member_remove` | `agent_invoke` |
| `grix_group` | `update_member_role` | `group_member_role_update` | `agent_invoke` |
| `grix_group` | `update_all_members_muted` | `group_all_members_muted_update` | `agent_invoke` |
| `grix_group` | `update_member_speaking` | `group_member_speaking_update` | `agent_invoke` |
| `grix_group` | `dissolve` | `group_dissolve` | `agent_invoke` |

### 8.3 CLI `openclaw grix ...`

| OpenClaw CLI | 插件处理 | 下游协议 |
|---|---|---|
| `openclaw grix doctor` | 读取当前 OpenClaw 配置并输出账号概览 | 不走 AIBot，不走远端 HTTP |

---

## 9. 当前没有做的映射

为了避免误解，这些也一并说明：

| 能力 | 当前状态 |
|---|---|
| 普通聊天文本 -> OpenClaw 原生命令解析 | 没做，明确关闭 |
| OpenClaw block 分段流 -> AIBot block 流 | 没做，明确改成快照流 |
| `event_react` -> OpenClaw 业务处理 | 入口已留，当前未落具体业务转换 |
| Threads / Polls | `capabilities` 里明确是 `false` |

---

## 10. 一句话总结

当前 `grix` 插件其实有两条对接线：

1. OpenClaw Channel / Message Action / Exec Approval 这条线，翻译到 AIBot WebSocket 命令
2. OpenClaw Admin Tool 里 `grix_query` / `grix_group` 现在也走 AIBot WebSocket；CLI 只保留本地检查

如果只问“对接了哪些 AIBot 协议”，当前实际涉及的是这两组命令：

1. AIBot -> 插件：`auth_ack`、`ping`、`event_msg`、`event_react`、`event_revoke`、`event_stop`、`local_action`、`kicked`、`send_ack`、`send_nack`、`error`、`agent_invoke_result`
2. 插件 -> AIBot：`auth`、`pong`、`event_ack`、`event_result`、`event_stop_ack`、`event_stop_result`、`send_msg`、`client_stream_chunk`、`delete_msg`、`session_route_bind`、`session_route_resolve`、`session_activity_set`、`local_action_result`、`agent_invoke`

如果只问“OpenClaw 侧暴露了哪些主要命令 / 工具入口”，核心就是这些：

`grix` channel、`unsend`、`delete`、`grix_query`、`grix_group`、`openclaw grix doctor`
