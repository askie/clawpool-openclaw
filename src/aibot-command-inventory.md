# Grix 插件侧 AIBot 命令清单

> 用途：给 AIBot / backend 对齐插件当前真实协议面  
> 代码基准：`src/client.ts`、`src/monitor.ts`、`src/local-actions.ts`、`src/admin/agent-api-actions.ts`、`src/actions.ts`

## 1. 当前固定握手信息

- `protocol_version`: `aibot-agent-api-v1`
- `contract_version`: `1`
- `client`: `openclaw-grix`
- `client_type`: `openclaw`
- `plugin_id`: `grix`
- `host_type`: `openclaw`
- `capabilities`:
  - `stream_chunk`
  - `session_route`
  - `local_action_v1`
  - `agent_invoke`
  - `inbound_media_v1`
  - `reaction_v1`
  - `thread_v1`
- `local_actions`:
  - `exec_approve`
  - `exec_reject`

## 2. 顶层命令总表

### 2.1 插件 -> AIBot

| cmd | 用途 | 关键字段 | 预期返回 / 交互说明 |
| --- | --- | --- | --- |
| `auth` | 建连后鉴权 | `agent_id`、`api_key`、`protocol_version`、`contract_version`、`capabilities`、`local_actions` | 必须回 `auth_ack` |
| `ping` | 插件主动保活探测 | `ts`、`source="grix_keepalive"` | 必须回 `pong` |
| `pong` | 响应 AIBot 主动 `ping` | `ts` | 通常复用对方 `seq`；不再等回包 |
| `event_ack` | 确认收到入站事件 | `event_id`、`received_at`，可带 `session_id`、`msg_id` | 单向通知，不等回包 |
| `event_result` | 告知一轮消息处理最终状态 | `event_id`、`status`，可带 `code`、`msg`、`updated_at` | 单向通知，不等回包 |
| `event_stop_ack` | 确认收到停止请求 | `event_id`、`accepted`，可带 `stop_id`、`updated_at` | 单向通知，不等回包 |
| `event_stop_result` | 告知停止请求最终结果 | `event_id`、`status`，可带 `stop_id`、`code`、`msg`、`updated_at` | 单向通知，不等回包 |
| `send_msg` | 发送普通文本或媒体消息 | `session_id`、`client_msg_id`、`msg_type`、`content`；媒体时再带 `media_url`；可带 `event_id`、`quoted_message_id`、`thread_id`、`extra` | 等 `send_ack` / `send_nack` / `error` |
| `client_stream_chunk` | 发送流式文本增量 | `session_id`、`client_msg_id`、`chunk_seq`、`delta_content`、`is_finish`；可带 `event_id`、`quoted_message_id`、`thread_id` | 中间包不等回包；仅 `is_finish=true` 的收尾包等待 `send_ack` / `send_nack` / `error` |
| `delete_msg` | 删除 / 撤回消息 | `session_id`、`msg_id` | 等 `send_ack` / `send_nack` / `error` |
| `react_msg` | 增删表情反应 | `session_id`、`msg_id`、`emoji`、`op` (`add` / `remove`) | 等 `send_ack` / `send_nack` / `error` |
| `media_upload_init` | 初始化媒体上传 | `upload_id`、`name`、`size_bytes`，可带 `mime`、`purpose` | 等 `send_ack` / `send_nack` / `error`；当前仓库已实现传输接口，但没有现成业务调用点 |
| `session_route_bind` | 记录 `route_session_key -> session_id` 映射 | `channel`、`account_id`、`route_session_key`、`session_id` | 等 `send_ack` / `send_nack` / `error` |
| `session_route_resolve` | 通过 `route_session_key` 反查真实会话 | `channel`、`account_id`、`route_session_key` | 等 `send_ack` / `send_nack` / `error`；`send_ack.payload.session_id` 必须存在 |
| `session_activity_set` | 告知“正在输入”状态 | `session_id`、`kind="composing"`、`active`；可带 `ref_event_id`、`ref_msg_id` | 单向通知，不等回包 |
| `local_action_result` | 返回本地动作执行结果 | `action_id`、`status`；可带 `result`、`error_code`、`error_msg` | 单向通知，不等回包 |
| `agent_invoke` | 发起查询 / 群管理 / 远端 agent 管理 | `invoke_id`、`action`、`params`、`timeout_ms` | 必须回 `agent_invoke_result` |

### 2.2 AIBot -> 插件

| cmd | 用途 | 关键字段 | 插件当前行为 |
| --- | --- | --- | --- |
| `auth_ack` | 返回鉴权结果 | `code`、`msg`，成功时还应有 `heartbeat_sec`，可带 `protocol` | `code=0` 视为成功，随后开始正常收发 |
| `ping` | 服务端主动保活 | 可为空 | 插件立即回 `pong` |
| `pong` | 响应插件主动 `ping` | 可为空 | 作为 keepalive 成功信号 |
| `event_msg` | 入站消息事件 | 最少要有 `session_id`、`msg_id`，正文走 `content`，媒体走 `attachments`；可带 `event_id`、`mirror_mode`、`quoted_message_id`、`thread_id`、`root_msg_id`、`context_messages`、`sender_id`、`mention_user_ids`、`created_at` | 先记账和路由，若有 `event_id` 会回 `event_ack`；`mirror_mode=record_and_process` 时最终回 `event_result`，`record_only` 时只落库不回 `event_result` |
| `event_react` | 入站表情事件 | `session_id`、`msg_id`、`emoji`；可带 `event_id`、`op`、`actor_id` | 当前仅记录日志；若带 `event_id` 会回 `event_ack` |
| `event_revoke` | 入站撤回事件 | `session_id`、`session_type`、`msg_id`；可带 `event_id`、`sender_id`、`is_revoked`、`system_event` | 若带 `system_event`，会写成系统事件；若带 `event_id` 会回 `event_ack` |
| `event_stop` | 停止当前回复 | `event_id`、`session_id`；可带 `stop_id`、`trigger_msg_id`、`stream_msg_id`、`reason` | 先回 `event_stop_ack`；若没有活动回复则立刻回 `event_stop_result(status=already_finished)`，否则等停止完成后回最终结果 |
| `local_action` | 下发稳定本地动作 | `action_id`、`action_type`；可带 `event_id`、`params`、`timeout_ms` | 当前只支持 `exec_approve`、`exec_reject`，最终回 `local_action_result` |
| `kicked` | 服务端踢下线 | `reason` 或 `msg` | 插件关闭当前连接并重连；`reason=replaced_by_new_connection` 会加大重连惩罚 |
| `send_ack` | 对请求型命令的成功回包 | 载荷随原命令变化 | 被 `send_msg`、`client_stream_chunk` 收尾包、`delete_msg`、`react_msg`、`media_upload_init`、`session_route_bind`、`session_route_resolve` 复用 |
| `send_nack` | 对请求型命令的失败回包 | 通常有 `code`、`msg`，可带 `client_msg_id` | 插件把它当错误处理；`send_msg` 特别识别 `4008` 和 `4004` |
| `error` | 对请求型命令的失败回包 | 通常有 `code`、`msg` | 和 `send_nack` 同等处理 |
| `agent_invoke_result` | `agent_invoke` 的结果 | `invoke_id`、`code`、`msg`、`data` | `code=0` 视为成功，其余当失败抛回上层 |

## 3. 标准回包约定

### 3.1 `auth_ack`

- 成功：`code=0`
- 失败：`code!=0`
- 成功时插件还会读取：
  - `heartbeat_sec`
  - `protocol`

### 3.2 `send_ack`

`send_ack` 是复用回包，插件当前按下面几类使用：

| 原请求 | 插件实际依赖的成功字段 |
| --- | --- |
| `send_msg` | 一般希望拿到 `msg_id`，也会透传 `client_msg_id` |
| `client_stream_chunk` 收尾包 | 不强依赖特定字段，只要成功即可 |
| `delete_msg` | 常见为 `msg_id`、`session_id`、`deleted` |
| `react_msg` | 常见为 `msg_id` |
| `media_upload_init` | 常见为 `upload_id`、`upload_url`、`method`、`media_url`、`headers` |
| `session_route_bind` | 常见为 `channel`、`account_id`、`route_session_key`、`session_id` |
| `session_route_resolve` | `session_id` 是硬要求，其他字段可选 |

### 3.3 `send_nack` / `error`

插件当前已经明确依赖的失败语义：

- `code=4008`: 视为发送过快，仅 `send_msg` 会自动重试，最多 3 次
- `code=4004`: 视为消息过大，`send_msg` 会自动拆分文本；媒体消息会改成“媒体 + 后续文本分段”
- 其他错误：直接失败，不做额外兼容兜底

### 3.4 `agent_invoke_result`

- 成功：`code=0`，结果从 `data` 取
- 失败：`code!=0`，插件把 `code` + `msg` 作为错误抛出

## 4. 关键交互时序

### 4.1 普通入站消息

`mirror_mode=record_and_process` 时：

1. AIBot 发 `event_msg`
2. 插件记录事件并回 `event_ack`
3. 插件可能发若干 `session_activity_set(active=true)`
4. 插件按需要发 `client_stream_chunk` 和 / 或 `send_msg`
5. 插件结束时发 `event_result`
6. 插件把输入状态收回：`session_activity_set(active=false)`

`mirror_mode=record_only` 时：

1. AIBot 发 `event_msg`
2. 插件记录事件并回 `event_ack`
3. 插件不分发给 OpenClaw，不发 `event_result`

### 4.2 停止回复

1. AIBot 发 `event_stop`
2. 插件立刻回 `event_stop_ack(accepted=true)`
3. 若当前没有活动回复，插件立刻回 `event_stop_result(status=already_finished)`
4. 若当前有活动回复，插件中止运行
5. 若停止前还没有发出可见回复，插件会补一条 `event_result(status=canceled, code=owner_requested_stop)`
6. 停止流程结束后，插件回 `event_stop_result(status=stopped, code=owner_requested_stop)`

### 4.3 流式文本

1. 插件连续发 `client_stream_chunk(is_finish=false)`
2. 这些中间包当前不等待回包
3. 收尾时插件发 `client_stream_chunk(is_finish=true, delta_content="")`
4. 只有最后这包会等待 `send_ack` / `send_nack` / `error`

### 4.4 本地动作

1. AIBot 发 `local_action`
2. 插件校验 `action_id`、`action_type`
3. 插件执行稳定动作
4. 插件回 `local_action_result`

### 4.5 远端查询 / 管理

1. 插件发 `agent_invoke`
2. AIBot 回 `agent_invoke_result`
3. `code=0` 走成功，`data` 原样交上层
4. `code!=0` 直接按失败处理

## 5. `agent_invoke.action` 全量清单

### 5.1 查询类

| `action` | 上层来源 | `params` |
| --- | --- | --- |
| `contact_search` | `grix_query.action=contact_search` | `id?`、`keyword?`、`limit?`、`offset?` |
| `session_search` | `grix_query.action=session_search` | `id?`、`keyword?`、`limit?`、`offset?` |
| `message_history` | `grix_query.action=message_history` | `session_id`、`before_id?`、`limit?` |
| `message_search` | `grix_query.action=message_search` | `session_id`、`keyword`、`before_id?`、`limit?` |

### 5.2 远端 agent 管理类

| `action` | 上层来源 | `params` |
| --- | --- | --- |
| `agent_api_create` | `grix_admin.action=create_agent`，或不带 `action` 的默认创建 agent | `agent_name`、`introduction?`、`is_main?` |
| `agent_category_list` | `grix_admin.action=list_categories` | 空对象 |
| `agent_category_create` | `grix_admin.action=create_category` | `name`、`parent_id`、`sort_order?` |
| `agent_category_update` | `grix_admin.action=update_category` | `category_id`、`name`、`parent_id`、`sort_order?` |
| `agent_category_assign` | `grix_admin.action=assign_category` | `agent_id`、`category_id` |

### 5.3 群管理类

| `action` | 上层来源 | `params` |
| --- | --- | --- |
| `group_create` | `grix_group.action=create` | `name`、`member_ids?`、`member_types?` |
| `group_detail_read` | `grix_group.action=detail` | `session_id` |
| `group_leave_self` | `grix_group.action=leave` | `session_id` |
| `group_member_add` | `grix_group.action=add_members` | `session_id`、`member_ids`、`member_types?` |
| `group_member_remove` | `grix_group.action=remove_members` | `session_id`、`member_ids`、`member_types?` |
| `group_member_role_update` | `grix_group.action=update_member_role` | `session_id`、`member_id`、`member_type`（默认 `1`，且当前只接受 `1`）、`role`（`1` 或 `2`） |
| `group_all_members_muted_update` | `grix_group.action=update_all_members_muted` | `session_id`、`all_members_muted` |
| `group_member_speaking_update` | `grix_group.action=update_member_speaking` | `session_id`、`member_id`、`member_type`（默认 `1`，支持 `1` / `2`）、`is_speak_muted?`、`can_speak_when_all_muted?`；两者至少要有一个 |
| `group_dissolve` | `grix_group.action=dissolve` | `session_id` |

## 6. `local_action.action_type` 全量清单

| `action_type` | `params` | 结果说明 |
| --- | --- | --- |
| `exec_approve` | `exec_context_id` 必填；`actor_id` 必填；`decision?` 只接受 `allow-once` / `allow-always`，默认 `allow-once` | 成功回 `local_action_result(status=ok, result={ exec_context_id, decision })` |
| `exec_reject` | `exec_context_id` 必填；`actor_id` 必填；`decision?` 只接受 `deny`，默认 `deny` | 成功回 `local_action_result(status=ok, result={ exec_context_id, decision: "deny" })` |

失败时插件当前会用这些状态 / 错误码：

- `status=failed`, `error_code=invalid_payload`
- `status=failed`, `error_code=exec_approval_disabled`
- `status=failed`, `error_code=exec_approval_unauthorized`
- `status=failed`, `error_code=execution_failed`
- `status=unsupported`, `error_code=unsupported_action`

## 7. 当前不在 AIBot 对齐范围内的插件命令

这些在插件里存在，但不是发给 AIBot 的协议命令：

- OpenClaw 消息动作名：`react`、`unsend`、`delete`
- OpenClaw 工具名：`grix_query`、`grix_group`、`grix_admin`
- 本地 CLI：`openclaw grix doctor`

它们最终会落到上面的 `react_msg`、`delete_msg`、`agent_invoke`，或者完全不经过 AIBot。
