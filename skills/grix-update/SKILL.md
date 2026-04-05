---
name: grix-update
description: 负责 Grix 插件的后续版本维护。适用于检查是否有新版本、执行插件升级、在升级后完成校验与重启，并按规则静默或通知主 agent；不负责首次安装、账号注册、本地绑定或安装私聊流程。
---

# Grix Update

这个技能只负责 **Grix 插件的版本维护**。  
目标是让 `@dhf-openclaw/grix` 在已经装进 OpenClaw 之后，能按固定规则完成检查更新、升级验收和失败告警。

## 角色边界

1. 本技能只做插件更新相关动作：检查、升级、校验、重启、通知。
2. 本技能不做首次安装、不做账号注册、不做 agent 绑定。
3. 本技能不接管安装私聊；如果当前上下文仍处在 egg 安装流程中，停止并交回 `grix-egg` / `grix-admin`。
4. 只走 OpenClaw 官方 CLI，不手改 `openclaw.json`，不写临时脚本改插件安装目录。

## 适用场景

1. 用户要求“检查 grix 是否有新版本”。
2. 用户要求“升级 grix 插件”。
3. 需要给后续自动化提供一个单独的维护技能。
4. 定时任务想要静默检查，只有失败时才通知主 agent。

## 输入参数

### 通用参数

1. `mode`（必填）
   - `check-only`
   - `apply-update`
   - `check-and-apply`
2. `plugin_id`（可选）
   - 默认值：`grix`
3. `notify_on`（可选）
   - `failure`（默认）
   - `always`
   - `never`
4. `main_agent`（可选）
   - 需要发送通知时使用；如果 `notify_on=never`，可以省略
5. `allow_restart`（可选）
   - 默认值：`true`

### 推荐默认输入

```json
{
  "mode": "check-and-apply",
  "plugin_id": "grix",
  "notify_on": "failure",
  "allow_restart": true
}
```

## 完成标准

只有同时满足下面条件，才算完成：

1. 已确认目标插件是否存在。
2. 已确认当前安装方式是否支持自动更新。
3. 已执行检查动作，并给出明确结果：无更新 / 已升级 / 失败 / 不支持。
4. 若执行了升级，已完成：
   - `openclaw plugins doctor`
   - `openclaw gateway restart`（仅在 `allow_restart=true` 时）
   - `openclaw health`
5. 若配置了通知规则，已按规则完成通知或静默结束。

## 执行规则

### 0. 先做上下文守卫

1. 如果当前明显是 egg 安装私聊，或上下文里有 `install_id`、`egg`、`install.route` 这类安装字段，不要执行更新，直接说明当前场景不适合升级插件并停止。
2. 不要在正在进行的安装对话里触发插件升级。

### 1. 先确认插件存在

优先执行：

```bash
openclaw plugins info <plugin_id> --json
```

规则：

1. 若插件不存在，返回 `failed/not_installed` 并停止。
2. 若命令失败，返回失败原因，不要继续猜测。

### 2. 再确认当前是否支持自动更新

先执行：

```bash
openclaw plugins update <plugin_id> --dry-run
```

规则：

1. 如果 dry-run 明确表示当前插件不可更新、未被跟踪、不是 npm 安装，返回 `unsupported/not_npm_install` 并停止。
2. 只有支持更新时，才能继续后续流程。
3. 不要把本地目录安装、`--link` 安装、手工拷贝安装强行当作可自动更新。

### 3. `check-only`

只做检查，不做升级。

规则：

1. 运行 dry-run。
2. 若没有新版本：
   - 返回 `no_update`
   - 默认静默结束
3. 若发现新版本：
   - 返回 `update_available`
   - 不执行真正升级

### 4. `apply-update`

假定调用方已经决定升级，直接执行升级。

执行顺序：

```bash
openclaw plugins update <plugin_id>
openclaw plugins doctor
openclaw gateway restart
openclaw health
```

规则：

1. 若 `allow_restart=false`，跳过 `openclaw gateway restart`，但要明确说明升级后尚未重启，运行态可能仍是旧版本。
2. 任一步失败都要立刻停止，并返回失败点。
3. 不要在失败后自动连续重试。

### 5. `check-and-apply`

这是给自动化最合适的模式。

规则：

1. 先跑 dry-run。
2. 若没有新版本：
   - 返回 `no_update`
   - 静默结束
3. 若发现新版本：
   - 执行 `apply-update` 的完整流程

## 校验顺序

如果执行了升级，校验必须按这个顺序走：

1. `openclaw plugins doctor`
2. `openclaw gateway restart`（如果允许）
3. `openclaw health`

不要写完升级命令就直接宣称成功。

## 通知规则

`notify_on` 的行为固定如下：

1. `never`
   - 永远不发送通知
2. `failure`
   - 只有失败时通知主 agent
3. `always`
   - 成功和失败都通知主 agent

默认使用 `failure`。

## 通知内容要求

通知必须简短，只说结果，不展开技术细节。

建议文案风格：

1. 成功：
   - `grix 插件已升级完成，当前检查正常。`
2. 无更新：
   - `grix 插件已检查，当前没有新版本。`
3. 失败：
   - `grix 插件自动更新失败，卡在 <步骤>。`
4. 不支持自动更新：
   - `grix 当前不是可自动更新的安装方式，需改成 npm 安装后再接自动更新。`

## 返回结果

技能应返回清晰、稳定的结果状态，推荐收口为以下几类：

1. `no_update`
2. `update_available`
3. `updated`
4. `failed`
5. `unsupported`

若失败，必须说明失败点属于哪一步：

1. `plugins info`
2. `plugins update --dry-run`
3. `plugins update`
4. `plugins doctor`
5. `gateway restart`
6. `health`

## Guardrails

1. 不改首次安装相关逻辑，不替代 `grix-register`、`grix-admin`、`grix-egg`。
2. 不在安装私聊中做插件升级。
3. 只用官方命令：
   - `openclaw plugins info`
   - `openclaw plugins update`
   - `openclaw plugins doctor`
   - `openclaw gateway restart`
   - `openclaw health`
4. 不直接修改插件目录，不手动覆盖 npm 包内容。
5. 不为了“兼容”老安装方式去补各种旁路逻辑；不支持就是不支持。
6. 如果升级后未重启，不得宣称运行态已经完成切换。
7. 不自动高频重试；失败后交给下一个定时周期或人工介入。

## 推荐自动化接法

给定时任务使用时，优先采用：

```json
{
  "mode": "check-and-apply",
  "plugin_id": "grix",
  "notify_on": "failure",
  "main_agent": "main",
  "allow_restart": true
}
```

推荐频率：

1. 每天 1 次
2. 或每 6 小时 1 次

默认策略：

1. 没更新：静默
2. 更新成功：静默
3. 更新失败：通知主 agent

## 推荐 Cron 挂法

如果要在插件安装完成后自动维护，推荐直接创建一个隔离式 cron 任务，而不是把升级动作塞进主会话心跳。

推荐命令：

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

规则：

1. `--session isolated`：不要绑主会话，避免更新和重启打断当前聊天。
2. `--no-deliver`：成功时保持静默。
3. `notify_on` 在 cron 场景里建议固定为 `never`，由 cron 自己的运行记录负责排查。
4. `main_agent` 应使用负责本机维护的主 agent。
5. 推荐频率先用 `6h`；如果你想更保守，可改成每天 1 次。

如果已经存在同名任务，不要重复创建，改用：

```bash
openclaw cron edit <job_id> \
  --every "6h" \
  --agent <main_agent> \
  --session isolated \
  --light-context \
  --no-deliver \
  --message 'Use the grix-update skill with {"mode":"check-and-apply","plugin_id":"grix","notify_on":"never","allow_restart":true}. If there is no update or the update succeeds, reply exactly NO_REPLY. If the install is unsupported or any step fails, return one short failure summary.'
```

创建后建议检查：

```bash
openclaw cron list
openclaw cron status
```

## 与其他技能的分工

1. `grix-register`
   - 只负责云端账号和 API agent 参数
2. `grix-admin`
   - 只负责本地配置和绑定
3. `grix-egg`
   - 只负责安装私聊流程
4. `grix-update`
   - 只负责后续版本维护

## References

1. [references/update-contract.md](references/update-contract.md)
2. [references/cron-setup.md](references/cron-setup.md)
