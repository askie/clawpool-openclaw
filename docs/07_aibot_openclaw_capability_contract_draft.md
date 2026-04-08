# AIBot / OpenClaw Grix Capability Contract Draft

> 更新时间：2026-04-08  
> 状态：第一批已在插件侧落地  
> 适用范围：`src/types.ts`、`src/client.ts`、`src/channel.ts`、`src/monitor.ts`、`src/actions.ts`

这份文档只回答一件事：

1. AIBot 和 `grix` 插件之间，哪些能力应该走稳定合同
2. 第一批已经落到插件里的字段和命令是什么
3. 还需要 server 侧继续补什么，才能把本地文件上传和投票闭环接完

---

## 1. 总原则

1. 传输能力走正式协议字段或正式命令，不走聊天文本语法。
2. 插件只负责稳定翻译，不负责猜业务规则。
3. AIBot 负责把各端差异整理成统一字段，再发给插件。
4. 没协商到的能力不启用，不靠版本猜测。

### 1.1 文档分工

三份文档各自只负责一件事：

1. `docs/04_grix_plugin_server_boundary_refactor_plan.md`
   负责回答“责任归谁”。
2. `docs/07_aibot_openclaw_capability_contract_draft.md`
   负责回答“协议字段和命令长什么样”。
3. `docs/03_grix_openclaw_protocol_mapping.md`
   负责回答“当前代码已经实现到了哪里”。

如果三者出现冲突，按下面顺序解释：

1. 责任边界以 `docs/04...` 为准
2. 协议命令和字段以 `docs/07...` 为准
3. 现状描述以 `docs/03...` 为准

### 1.2 唯一责任方规则

每类事情必须只有一个主责任方，另一侧不能偷偷补逻辑：

1. 平台差异整理，归 AIBot
2. OpenClaw 本地宿主接入，归插件
3. 远端业务流程编排，归 AIBot
4. 本地动作执行和回执，归插件
5. 能力协商、降级判断、兼容矩阵，归 AIBot
6. OpenClaw 入站和出站最小字段映射，归插件

为了避免一句话规则在执行时变模糊，下面这张矩阵作为落地判断表：

| 事项 | 主责任方 | 另一侧明确不能做什么 |
|---|---|---|
| 平台原始消息整理 | AIBot | 插件不能自己猜平台业务语义 |
| OpenClaw 字段映射 | 插件 | AIBot 不能依赖 OpenClaw 内部字段细节来定义协议 |
| 能力开关、降级、兼容矩阵 | AIBot | 插件不能自己补版本判断和降级分支 |
| 本地动作执行与回执 | 插件 | AIBot 不能把本地动作重新塞回普通聊天文本 |
| 远端业务流程编排 | AIBot | 插件不能继续长出远端业务流程 |
| 本地线程、媒体、表情最小透传 | 插件 | AIBot 不能把这些映射细节回推给插件之外的聊天协议 |

### 1.3 禁止交叉的红线

插件侧明确不能做这些事：

1. 解析聊天文本里的伪协议命令
2. 根据业务语义猜卡片含义
3. 自己决定能力降级或兼容分支
4. 自己扩展远端业务流程
5. 依赖改 OpenClaw 源码的方式完成接入

AIBot 侧明确不能做这些事：

1. 依赖 OpenClaw 私有会话文件结构
2. 依赖插件本地临时实现细节来定义协议
3. 把本地宿主行为塞回普通聊天文本
4. 让插件代替 server 承担版本矩阵和策略判断

### 1.4 一项能力只允许一个正式入口

为了保证协议整洁，下面这些入口是固定的：

1. 普通聊天收发，只走 `event_msg` / `send_msg`
2. 远端业务能力，只走 `agent_invoke`
3. 本地宿主动作，只走 `local_action`
4. 表情，只走 `react_msg` / `event_react`
5. 媒体输入，只走 `attachments`
6. 本地文件上传，只走 `media_upload_init` 开始的正式上传链路
7. 线程，只走 `thread_id` / `root_msg_id`

以后只要遇到“两侧都要改”的需求，先按下面顺序检查：

1. 先判断它是不是传输能力
2. 再判断它的唯一正式入口是什么
3. 再判断主责任方到底是谁
4. 最后才决定字段和命令怎么改

---

## 2. 当前第一批能力

插件侧本次正式落了三类能力：

1. 入站媒体 `inbound_media_v1`
2. 表情动作 `reaction_v1`
3. 线程字段透传 `thread_v1`

上传本地文件这条线本次只补了客户端正式命令接口预留：

1. `media_upload_init`

但它还没有接到真实的 server 上传闭环，所以当前不会对外宣称这项能力已经完成。

---

## 3. 握手能力声明

插件在 `auth` 里固定上报这些稳定能力：

1. `stream_chunk`
2. `session_route`
3. `local_action_v1`
4. `agent_invoke`
5. `inbound_media_v1`
6. `reaction_v1`
7. `thread_v1`

约定：

1. 只加新能力、不改旧语义时，不升 `contract_version`
2. 改旧语义或删旧字段时，才升 `contract_version`

### 3.1 非本合同能力的固定出口

这份合同只覆盖媒体、表情、线程、上传这类传输能力。

不属于这份合同的能力，出口也必须固定：

1. 远端查询、群管理、管理接口编排，走 `agent_invoke`
2. 审批、本地执行确认、宿主控制，走 `local_action`
3. 普通聊天内容仍然只是普通聊天内容，不能兼职做协议通道

---

## 4. 入站消息合同

`event_msg` 第一批已经按下面这套稳定字段接住：

```json
{
  "cmd": "event_msg",
  "payload": {
    "event_id": "evt_1",
    "session_id": "g_123",
    "msg_id": "456",
    "content": "帮我看看这张图",
    "thread_id": "th_9",
    "root_msg_id": "321",
    "thread_label": "设计讨论",
    "attachments": [
      {
        "attachment_id": "att_1",
        "kind": "image",
        "url": "https://cdn.example.com/a.jpg",
        "mime": "image/jpeg",
        "name": "a.jpg",
        "size_bytes": 12345
      }
    ]
  }
}
```

插件侧映射规则：

1. `attachments[*].url` -> `MediaUrl` / `MediaUrls`
2. `attachments[*].mime` 或 `kind` -> `MediaType` / `MediaTypes`
3. `thread_id` -> `MessageThreadId`
4. `root_msg_id` -> `RootMessageId`
5. `thread_label` -> `ThreadLabel`

职责切分也固定：

1. AIBot 负责把原始平台媒体整理成统一 `attachments`
2. 插件负责把统一 `attachments` 映射成 OpenClaw 最小媒体字段
3. AIBot 不关心 OpenClaw 内部上下文字段名字
4. 插件不关心媒体业务语义，只负责稳定搬运

额外约束：

1. 媒体消息允许 `content` 为空
2. 只要 `attachments` 有可用地址，就按有效入站消息处理
3. 不再把“有媒体但没文字”的消息误判成非法空消息

---

## 5. 表情动作合同

插件侧已经正式支持 `react_msg`：

```json
{
  "cmd": "react_msg",
  "payload": {
    "session_id": "g_123",
    "msg_id": "456",
    "emoji": "👍",
    "op": "add"
  }
}
```

约定：

1. `op` 只允许 `add` 或 `remove`
2. `msg_id` 当前按数字消息 id 处理
3. `emoji` 为必填

职责切分固定为：

1. OpenClaw 要不要加表情，只通过插件调用 `react_msg`
2. AIBot 负责把 `react_msg` 落到真实平台
3. 平台上的表情变化，只通过 `event_react` 回来
4. 插件只确认收到了表情事件，不自己发明业务后果

入站 `event_react` 现在也已经有稳定类型，并会被插件接收和确认记录，但当前还没有继续翻成更高层的业务事件。

---

## 6. 线程透传合同

第一批只做“线程透传”，不做线程管理能力宣称扩张。

也就是说：

1. 入站 `event_msg.thread_id` 会进入 OpenClaw 当前消息上下文
2. 出站 `send_msg` / `client_stream_chunk` 会把 `thread_id` 原样带回 AIBot
3. 这能保证同一条线程里的回复、流式回复和表情动作都带上同一条线程标识

职责切分固定为：

1. AIBot 负责告诉插件“这是不是同一条线程”
2. 插件负责把线程标识继续带进 OpenClaw，再带回 AIBot
3. 插件不负责创建线程业务规则
4. AIBot 不负责猜 OpenClaw 如何保存本地线程上下文

当前还没有落的内容：

1. 原生 `thread-create`
2. 原生 `thread-list`
3. 投票与线程联动

---

## 7. 上传能力预留

插件客户端已经预留了：

```json
{
  "cmd": "media_upload_init",
  "payload": {
    "upload_id": "up_1",
    "name": "voice.ogg",
    "mime": "audio/ogg",
    "size_bytes": 54321,
    "purpose": "message_media"
  }
}
```

但要把它变成完整能力，server 侧还需要继续补：

1. 上传初始化回包结构
2. 文件上传方式
3. 上传完成后的正式 `media_url`
4. 插件收到正式 `media_url` 后再发消息

这条能力的职责边界必须保持干净：

1. AIBot 负责上传策略、上传地址、远端媒体标识
2. 插件只负责发起上传、上传文件、再按正式 `media_url` 发消息
3. 插件不能自己定义远端媒体地址规则
4. AIBot 不能假设插件知道远端存储实现细节

在这条链路没闭环前，插件不会宣称“本地文件上传已完成”。

---

## 8. 还没在第一批落的能力

这些能力仍然需要后续继续做：

1. `outbound_media_upload_v1` 完整闭环
2. `poll_v1`
3. `event_react` -> 更高层业务事件翻译
4. 原生线程管理动作

---

## 9. 验收标准

这次第一批在插件侧完成后，至少满足：

1. 带图片、音频、视频地址的 `event_msg` 会进入 OpenClaw 原生媒体上下文
2. 带 `thread_id` 的消息会保留线程上下文并把线程 id 带回出站回复
3. OpenClaw 侧可以正式调用 `react` 给消息加或取消表情
4. 相关能力已经有测试覆盖，且不破坏现有收发与流式回复
