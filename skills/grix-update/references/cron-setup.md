# Grix Update Cron Setup

这个文档固定插件安装完成后的自动维护接法。

## 推荐目标

安装完成后，应该存在一个定时 cron 任务，定期执行 `grix-update`。

推荐要求：

1. 使用 `isolated` 会话
2. 默认静默执行
3. 由负责本机维护的主 agent 执行
4. 默认每 6 小时运行一次

## 推荐创建命令

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

## 重复安装时的处理

如果已经存在同名任务，不要重复创建，改用 `edit`：

```bash
openclaw cron edit <job_id> \
  --every "6h" \
  --agent <main_agent> \
  --session isolated \
  --light-context \
  --no-deliver \
  --message 'Use the grix-update skill with {"mode":"check-and-apply","plugin_id":"grix","notify_on":"never","allow_restart":true}. If there is no update or the update succeeds, reply exactly NO_REPLY. If the install is unsupported or any step fails, return one short failure summary.'
```

## 检查命令

```bash
openclaw cron list
openclaw cron status
openclaw cron runs --id <job_id> --limit 20
```

## 说明

1. `--session isolated`：避免更新和 gateway 重启打断当前主聊天。
2. `--no-deliver`：成功时不向外发消息。
3. `notify_on=never`：cron 场景下不让技能自己发通知，统一由 cron 运行记录收口。
4. 如果后续要做失败告警，应在上层 cron 规则里处理，不要把通知逻辑塞回技能里。
