---
name: message-send
description: 发送消息。支持当前会话回复和跨会话发送。跨会话时使用准确的 `session_id` 或已存在的 `route.sessionKey` 作为 `to` 目标，不使用旧的 `target=agent:...` 格式。触发词：发私信、私信、发送消息、send message、notify。
---

# 消息发送技能

这个技能用于通过 OpenClaw 的 `message` 工具发送消息。

## 两种发送模式

### 1. 当前会话回复

如果就是回复当前 Grix 会话，直接发送，不需要额外提供目标会话。

**参数**：
- `action`: "send"
- `channel`: "grix"
- `accountId`: 当前账号 ID
- `message`: 消息内容

**示例**：

```json
{
  "action": "send",
  "channel": "grix",
  "accountId": "{accountId}",
  "message": "收到，正在处理中..."
}
```

### 2. 跨会话发送

如果要发到别的私聊或群聊，使用 `to` 指向目标会话。

**参数**：
- `action`: "send"
- `channel`: "grix"
- `accountId`: 当前账号 ID
- `to`: 目标会话标识
- `message`: 消息内容

**示例**：

```json
{
  "action": "send",
  "channel": "grix",
  "accountId": "{accountId}",
  "to": "{targetSessionId}",
  "message": "需要您确认一个开发决策：..."
}
```

## `to` 的真实写法

当前插件认的是下面两类目标：

1. 准确的 Grix `session_id`（推荐，通常是 UUID）
2. 已存在于当前运行时中的 `route.sessionKey`

推荐直接传裸 `session_id`：

```text
to=e72ce987-2d2e-40ed-bcc9-b336b4974512
```

兼容写法里，`grix:<session_id>` 或 `session:<session_id>` 也能被解析，但不要作为默认格式。

不要使用这些旧写法：

1. `target=agent:{agentId}:grix:direct:{sessionId}`
2. 纯数字用户 ID / agent ID
3. 不存在的会话别名

## 如何获取目标会话

1. 如果就是回复当前会话，直接省略 `to`
2. 如果 MEMORY.md 已记录目标 `session_id`，直接复用
3. 如果还不知道目标会话，先用 `grix_query` 的 `session_search` 找到准确 `session_id`

示例：

```json
{
  "action": "send",
  "channel": "grix",
  "accountId": "{accountId}",
  "to": "{groupSessionId}",
  "message": "任务已完成，请查看结果"
}
```

## 关键参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `action` | ✅ | 固定值 `"send"` |
| `channel` | ✅ | 固定值 `"grix"` |
| `accountId` | ✅ | 当前 Grix 账号 ID |
| `message` | ✅ | 消息内容 |
| `to` | 跨会话必填 | 准确 `session_id` 或可解析的 `route.sessionKey` |

## 注意事项

1. 使用 `to`，不要用 `target`
2. `to` 优先传准确 `session_id`，不要混淆用户 ID、agent ID 和会话 ID
3. 纯数字目标会直接失败，不会自动转成私聊
4. 跨会话发消息前，先确认当前账号对目标会话有发送权限
5. 消息内容支持纯文本和 markdown

## 会话卡片消息协议

当消息内容是在**提醒用户打开某个群聊**、**打开某个私聊对话**、**引用某个具体对话记录入口**时，如果已经拿到了准确的 `session_id`，不要发送自然语言链接，也不要发送前端内部 JSON；必须发送独立的 `grix://card/conversation` Markdown 链接，由前端统一解析并渲染为可点击的会话卡片。

### 标准格式

群聊：

```text
[打开群聊](grix://card/conversation?session_id=<SESSION_ID>&session_type=group&title=<URI_ENCODED_GROUP_TITLE>)
```

私聊：

```text
[打开对话](grix://card/conversation?session_id=<SESSION_ID>&session_type=private&title=<URI_ENCODED_CHAT_TITLE>&peer_id=<URI_ENCODED_PEER_ID>)
```

### 字段规则

- `session_id`：必填。必须是准确的目标会话 ID。
- `session_type`：必填。只能是 `group` 或 `private`。
- `title`：必填。展示给用户看的群标题或私聊标题。
- `peer_id`：仅私聊可选。用于补充私聊对象信息，但前端打开行为仍以 `session_id` 为准。

### 编码规则

为了避免标题、昵称、URL 等字段里的空格、换行或保留字符破坏链接，query 参数值应按 URI component 规则编码后再写入 `grix://card` 链接。

- 推荐：对 `title`、`peer_id`、以及未来可能扩展的文本字段统一做 URI component 编码
- `session_id` 和 `session_type` 如果本身只包含安全字符，可以直接原样输出
- 链接文本是给用户看的普通文案，不需要做 URI 编码

示例：

```text
[打开群聊](grix://card/conversation?session_id=session-9&session_type=group&title=%E4%BA%A7%E5%93%81%E8%AE%A8%E8%AE%BA%E7%BE%A4%20A)
```

### 使用要求

1. 只有在**已知准确 `session_id`** 时，才允许输出会话卡片
2. 如果没有 `session_id`，只能发送普通文本说明，不能伪造会话卡片
3. 不要输出 `chat://...`、网页链接、或“点这里打开会话”之类的自然语言链接替代方案
4. 不要构造前端内部 `biz_card` JSON，也不要尝试发送 Flutter/前端私有协议结构
5. `grix://card/conversation` 链接必须单行，且必须单独作为一条消息发送
6. 如果还要补说明，说明文字和卡片分两条消息发送；不要把说明和卡片混在同一条里
7. 同一条消息里不要放多张卡片；需要多个跳转入口时，分多条消息发送
8. 如果字段值包含特殊字符，先做 URI component 编码，再拼进链接

### 示例

示例 1：提醒用户进入群聊

```text
[打开产品群](grix://card/conversation?session_id=9d6a4b1d-5d37-4e38-ae6a-0c12a2c4c901&session_type=group&title=%E4%BA%A7%E5%93%81%E7%BE%A4)
```

示例 2：提醒用户进入某个私聊

```text
[打开 Alice 对话](grix://card/conversation?session_id=e72ce987-2d2e-40ed-bcc9-b336b4974512&session_type=private&title=Alice&peer_id=1001)
```

示例 3：带说明时分两条发送

```text
消息 1：测试群已经建好，你看下一条卡片就能直接进去。
消息 2：[打开测试群](grix://card/conversation?session_id=0fa947bd-bb4e-46ad-8308-5526bc98e002&session_type=group&title=%E6%B5%8B%E8%AF%95%E7%BE%A4)
```

## 错误处理

- `to` 无法解析：确认 `session_id` 或 `route.sessionKey` 是否正确
- 权限不足：检查当前 `accountId` 是否有目标会话的发送权限
- 参数缺失：确保必填参数都已提供
- 目标格式错误：检查 `to` 是否是准确 `session_id` 或有效 `route.sessionKey`

## 最佳实践

1. 跨会话发送时，优先记录和复用准确 `session_id`
2. 需要找会话时，先用 `grix_query.session_search`
3. 消息内容保持简洁，突出重点
4. 不要滥用主动消息，避免打扰 owner
5. 需要跳转时优先用会话卡片，而不是发普通说明文字
