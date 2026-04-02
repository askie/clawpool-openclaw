---
name: message-send
description: 发送私信消息。支持当前会话回复和跨会话私信。使用场景：(1) 需要给 owner/特定用户发送私信通知 (2) 跨会话发送消息 (3) 主动推送消息给指定目标。触发词：发私信、私信、发送消息、send message、notify。
---

# 消息发送技能

这个技能用于通过 OpenClaw 的 `message` 工具发送消息。

---

## 两种发送模式

### 1. 当前会话回复

在当前聊天上下文中回复消息，不需要额外参数。

**参数**：
- `action`: "send"
- `channel`: 当前渠道（如 "grix"）
- `accountId`: 当前账号 ID
- `message`: 消息内容

**使用场景**：
- 在当前对话中回复用户
- 当前会话内的正常消息发送

### 2. 跨会话私信

脱离当前聊天上下文，给其他会话发送私信。

**参数**：
- `action`: "send"
- `channel`: "grix"
- `accountId`: 发送账号 ID（如 "{accountId}"）
- `target`: 目标会话标识（格式见下文）
- `message`: 消息内容

**使用场景**：
- 给 owner 发送通知/审批请求
- 跨会话发送消息
- 主动推送消息给指定目标

---

## Target 格式说明

### Grix 私信格式

```
target=agent:{agentId}:grix:direct:{sessionId}
```

**参数说明**：
- `{agentId}`: 当前 agent 的 ID（如 "grix-developer"）
- `{sessionId}`: 目标私聊会话的 session ID（UUID 格式）

**示例**：
```
target=agent:grix-developer:grix:direct:e72ce987-2d2e-40ed-bcc9-b336b4974512
```

### 如何获取 sessionId

1. **从 inbound context 获取**：当 owner 给你发私信时，inbound meta 中的 `chat_id` 包含 session ID
2. **从 MEMORY.md 获取**：如果 workspace 的 MEMORY.md 记录了 owner 的会话 ID，直接使用
3. **从会话列表获取**：通过 `sessions_list` 工具查找目标会话

---

## 实际调用示例

### 示例 1：当前会话回复

```json
{
  "action": "send",
  "channel": "grix",
  "accountId": "{accountId}",
  "message": "收到，正在处理中..."
}
```

### 示例 2：给 owner 发私信

```json
{
  "action": "send",
  "channel": "grix",
  "accountId": "{accountId}",
  "target": "agent:{agentId}:grix:direct:{ownerSessionId}",
  "message": "需要您确认一个开发决策：..."
}
```

### 示例 3：发送到群组

```json
{
  "action": "send",
  "channel": "grix",
  "accountId": "{accountId}",
  "target": "{groupId}",
  "message": "任务已完成，请查看结果"
}
```

---

## 关键参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `action` | ✅ | 固定值 "send" |
| `channel` | ✅ | 渠道类型，如 "grix" |
| `accountId` | ✅ | 发送账号 ID |
| `message` | ✅ | 消息内容 |
| `target` | 私信必填 | 目标会话标识（私信/群组） |

---

## 注意事项

1. **区分 `target` 和 `to`**：Grix 使用 `target` 参数，不是 `to`
2. **sessionId 是 UUID**：不要混淆用户 ID 和会话 ID
3. **权限检查**：确保有目标会话的发送权限
4. **消息格式**：支持纯文本和 markdown

---

## 会话卡片消息协议

当消息内容是在**提醒用户打开某个群聊**、**打开某个私聊对话**、**引用某个具体对话记录入口**时，如果已经拿到了准确的 `session_id`，不要发送自然语言链接，也不要发送前端内部 JSON；必须发送显式的 `conversation-card` 指令文本，由前端统一解析并渲染为可点击的会话卡片。

### 标准格式

群聊：

```text
[[conversation-card|session_id=<SESSION_ID>|session_type=group|title=<GROUP_TITLE>]]
```

私聊：

```text
[[conversation-card|session_id=<SESSION_ID>|session_type=private|title=<CHAT_TITLE>|peer_id=<PEER_ID>]]
```

### 字段规则

- `session_id`：必填。必须是准确的目标会话 ID。
- `session_type`：必填。只能是 `group` 或 `private`。
- `title`：必填。展示给用户看的群标题或私聊标题。
- `peer_id`：仅私聊可选。用于补充私聊对象信息，但前端打开行为仍以 `session_id` 为准。

### 编码规则

为了避免标题里出现 `|`、`=`、`]`、空格、换行或其他保留字符导致前端解析失败，`conversation-card` 的字段值应按 URI component 规则编码后再写入指令。

- 推荐：对 `title`、`peer_id`、以及未来可能扩展的文本字段统一做 URI component 编码
- `session_id` 和 `session_type` 如果本身只包含安全字符，可以直接原样输出
- 前端会按 URI component 解码后再渲染

示例：

```text
[[conversation-card|session_id=session-9|session_type=group|title=%E4%BA%A7%E5%93%81%E8%AE%A8%E8%AE%BA%E7%BE%A4%20A]]
```

### 使用要求

1. 只有在**已知准确 `session_id`** 时，才允许输出 `conversation-card`。
2. 如果没有 `session_id`，只能发送普通文本说明，不能伪造会话卡片。
3. 不要输出 `chat://...`、网页链接、或“点这里打开会话”之类的自然语言链接替代方案。
4. 不要构造前端内部 `biz_card` JSON，也不要尝试发送 Flutter/前端私有协议结构。
5. `conversation-card` 必须单行发送，不要换行，不要在同一条指令里混入多余说明文字。
6. 如果字段值包含特殊字符，先做 URI component 编码，再拼进指令文本。

### 示例

示例 1：提醒用户进入群聊

```text
[[conversation-card|session_id=9d6a4b1d-5d37-4e38-ae6a-0c12a2c4c901|session_type=group|title=产品群]]
```

示例 2：提醒用户进入某个私聊

```text
[[conversation-card|session_id=e72ce987-2d2e-40ed-bcc9-b336b4974512|session_type=private|title=Alice|peer_id=1001]]
```

### 适用场景

- 给 owner 或其他用户发送“请进入这个对话继续处理”的提醒
- 发送“这是你要查看的群聊/私聊入口”的通知
- 发送引用型对话入口，而不是发送完整对话记录内容

### 不适用场景

- 普通文本通知
- 没有准确 `session_id` 的模糊提醒
- 需要直接发送完整对话记录内容的场景
- 仅仅告诉对方“我已经处理完了”，但并不需要跳转到某个具体会话的场景

---

## 错误处理

常见错误及处理方式：

- **target 不存在**：确认 session ID 是否正确
- **权限不足**：检查 accountId 是否有目标会话的发送权限
- **参数缺失**：确保必填参数都已提供
- **格式错误**：检查 target 格式是否符合要求

---

## 最佳实践

1. **记录 owner sessionId**：在 workspace 的 MEMORY.md 中记录 owner 的会话 ID，方便后续调用
2. **使用变量**：在代码中使用 `{agentId}`、`{accountId}` 等变量，而不是硬编码
3. **简洁明了**：私信消息应简洁，突出重点
4. **适当使用**：不要滥用私信功能，避免打扰 owner
5. **需要跳转时优先用会话卡片**：如果消息的核心目标是让对方打开某个已知会话，优先发送 `conversation-card` 指令，而不是发普通说明文字
