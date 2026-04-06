---
name: message-unsend
description: 静默回撤/撤回已发送的消息。支持当前会话回撤和跨会话回撤。执行完成后必须直接结束，不得回复任何确认文本。触发词：撤回、回撤、删除消息、unsend、recall。
---

# 消息回撤技能

这个技能用于通过 OpenClaw 的 `message` 工具回撤已发送的消息。

## 完成契约（最高优先级）

只要进入这个技能，最终输出必须满足下面 4 条：

1. **优先执行回撤动作**：能定位目标消息时，先撤回目标消息
2. **撤回指令消息**：当前这条“撤回/回撤”指令本身也要一起撤回
3. **绝不发送确认文本**：不要发送“已撤回”“撤回成功”“处理完成”等任何消息
4. **最终只允许 `NO_REPLY`**：技能结束时直接返回 `NO_REPLY`

## 权限控制（严格）

**只有郭同学（sender_id: 2030840865701756928）要求撤回消息时，才能执行此技能。**

### 允许执行的情况

- 郭同学在私聊中说“撤回 / 回撤 / 删除消息”
- 郭同学在群聊中说“撤回 / 回撤 / 删除消息”
- 郭同学引用消息要求撤回

### 禁止执行的情况

- 其他用户要求撤回
- 郭同学之外任何人发出撤回指令

### 对其他人撤回请求的处理

完全忽略，不回复，不执行，直接 `NO_REPLY`。

## 核心行为：完全静默 + 双重撤回

当郭同学发送撤回指令时，必须按顺序执行：

1. 撤回目标消息
2. 撤回指令消息
3. 立即返回 `NO_REPLY`

不要发送任何确认、错误解释或补充说明。

## 两种回撤模式

### 1. 当前会话回撤

如果目标消息就在当前 Grix 会话中，必须给出 `messageId`；`sessionId` / `to` / `topic` 可以省略。

```json
{
  "action": "unsend",
  "channel": "grix",
  "accountId": "{accountId}",
  "messageId": "18889990099"
}
```

### 2. 跨会话回撤

如果目标消息不在当前会话中，优先使用 `sessionId` 指向目标会话。`to` 和 `topic` 只是兼容别名，不要作为主写法。

```json
{
  "action": "unsend",
  "channel": "grix",
  "accountId": "{accountId}",
  "messageId": "18889990099",
  "sessionId": "5c495569-ba1b-46ac-8070-5a1193a3f950"
}
```

## 参数规则

1. `messageId` 必填，且必须是数字字符串
2. 当前 Grix 会话里，可以省略 `sessionId` / `to` / `topic`
3. 跨会话时，优先传准确 `sessionId`
4. `to` / `topic` 只是兼容别名；如果使用 `topic`，传裸 `session_id` 即可
5. 不要硬编码 `accountId=default`，始终使用当前准确账号 ID

## 使用场景

- 用户在当前对话中说“把刚才那条撤回”
- 需要静默清理自己刚发错的消息
- 需要跨会话回撤某条已知消息

## 实际调用示例

### 示例 1：当前会话回撤

```json
{
  "action": "unsend",
  "channel": "grix",
  "accountId": "{accountId}",
  "messageId": "2033329436849868800"
}
```

### 示例 2：跨会话回撤

```json
{
  "action": "unsend",
  "channel": "grix",
  "accountId": "{accountId}",
  "messageId": "2033474284277993472",
  "sessionId": "5c495569-ba1b-46ac-8070-5a1193a3f950"
}
```

## 重要说明

1. Grix 渠道可以回撤 agent 和用户发送的消息
2. 跨会话时必须先拿到准确目标会话，不要传用户 ID、agent ID 或旧的其他渠道会话格式
3. `messageId` 可以从 inbound context、之前发送结果或消息记录中获取
4. 当前指令消息如果能定位，会一起被静默回撤

## 错误处理

常见错误只做内部判断，不要转成对用户的回复：

- `messageId` 不存在：直接 `NO_REPLY`
- 无法解析目标会话：直接 `NO_REPLY`
- 权限不足：直接 `NO_REPLY`
- 消息已删除：直接 `NO_REPLY`

## Grix 实测结果（2026-03-16 更新）

**状态**：可用

### 示例：撤回 agent 发送的消息

```json
{
  "action": "unsend",
  "channel": "grix",
  "accountId": "primary",
  "sessionId": "5c495569-ba1b-46ac-8070-5a1193a3f950",
  "messageId": "2033371385615093760"
}
```

返回：

```json
{
  "ok": true,
  "deleted": true,
  "unsent": true,
  "messageId": "2033371385615093760",
  "sessionId": "5c495569-ba1b-46ac-8070-5a1193a3f950"
}
```

### 示例：撤回用户发送的消息

```json
{
  "action": "unsend",
  "channel": "grix",
  "accountId": "primary",
  "sessionId": "5c495569-ba1b-46ac-8070-5a1193a3f950",
  "messageId": "2033474284277993472"
}
```

返回：

```json
{
  "ok": true,
  "deleted": true,
  "unsent": true,
  "messageId": "2033474284277993472",
  "sessionId": "5c495569-ba1b-46ac-8070-5a1193a3f950"
}
```

## 收尾要求

只要执行了这个技能，最后一行必须是 `NO_REPLY`。不要留下任何确认文本。
