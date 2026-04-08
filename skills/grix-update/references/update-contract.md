# Grix Update Contract

这个文档用于固定 `grix-update` 的最小执行契约，方便后续接定时任务、心跳提醒或其他维护流程时保持一致。

## 目标

`grix-update` 只做下面 5 件事：

1. 确认插件是否存在
2. 确认当前安装方式是否支持自动更新
3. 检查是否有新版本
4. 需要时执行升级
5. 在升级后完成校验、重启和结果通知

## 命令阶梯

按顺序使用这些官方命令：

```bash
openclaw plugins info grix --json
openclaw plugins update grix --dry-run
openclaw plugins update grix
openclaw plugins doctor
openclaw gateway restart
openclaw health
```

规则：

1. 先 `info`，再 `dry-run`，不要跳步。
2. `dry-run` 没显示可更新时，不执行真正升级。
3. 真正升级后，不要跳过 `doctor`。
4. 允许重启时，`doctor` 后面必须接 `gateway restart` 和 `health`。

## 模式定义

### `check-only`

用途：只检查，不升级。

收口：

1. 没新版本：`no_update`
2. 有新版本：`update_available`
3. 插件不存在或安装方式不支持：`failed` / `unsupported`

### `apply-update`

用途：直接执行升级。

收口：

1. 升级并验收成功：`updated`
2. 任一步失败：`failed`

### `check-and-apply`

用途：自动化默认模式。

收口：

1. 没新版本：`no_update`
2. 有新版本且升级成功：`updated`
3. 任一步失败：`failed`
4. 安装方式不支持：`unsupported`

## 返回值语义

建议把结果理解成下面几种业务状态：

1. `no_update`
   - 已检查，没有可升级版本
2. `update_available`
   - 已检查，发现可升级版本，但本次没有执行升级
3. `updated`
   - 已完成升级，并且升级后检查通过
4. `failed`
   - 在检查、升级、重启或验收中的某一步失败
5. `unsupported`
   - 当前安装方式不支持自动更新

## 失败点命名

失败时，建议把失败点固定在这些步骤里：

1. `plugins_info`
2. `plugins_update_dry_run`
3. `plugins_update`
4. `plugins_doctor`
5. `gateway_restart`
6. `health`

这样后续接自动化时更容易做统计和告警。

## 通知契约

`notify_on` 只允许这 3 个值：

1. `never`
2. `failure`
3. `always`

默认值：`failure`

补充说明：

1. `main_agent` 主要用于选择哪个本地 agent 负责执行维护任务，例如 cron 里的 `--agent <main_agent>`。
2. `main_agent` 本身不是可直接发送 Grix 消息的目标；如果没有明确的通知会话，就只返回结果，由上层任务或 cron 记录处理通知。
3. cron 默认用 `notify_on=never`，不要在技能内部再猜一条通知路径。

建议通知文案保持一句话：

1. 成功：`grix 插件已升级完成，当前检查正常。`
2. 无更新：`grix 插件已检查，当前没有新版本。`
3. 失败：`grix 插件自动更新失败，卡在 <步骤>。`
4. 不支持：`grix 当前不是可自动更新的安装方式，需改成 npm 安装后再接自动更新。`

## 自动化建议

推荐给定时任务直接使用：

```json
{
  "mode": "check-and-apply",
  "plugin_id": "grix",
  "notify_on": "never",
  "main_agent": "main",
  "allow_restart": true
}
```

推荐频率：

1. 每天 1 次
2. 或每 6 小时 1 次

默认行为：

1. 没更新：静默结束
2. 更新成功：静默结束
3. 更新失败：在 cron 运行记录里保留失败结果，由维护者或上层任务统一处理

## 禁止事项

1. 不在 egg 安装私聊里触发升级
2. 不直接修改插件目录
3. 不手工覆盖 npm 包文件
4. 不为了兼容旧安装方式写旁路逻辑
5. 不在一次失败后做连续重试
