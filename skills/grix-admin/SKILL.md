---
name: grix-admin
description: 负责 OpenClaw 本地配置与后续 agent 管理；支持接收 grix-register 交接参数直接落地，也支持在已有主密钥下新建 agent 再落地。
---

# Grix Agent Admin

`grix-admin` 只负责本地配置和管理动作。支持两个入口模式，二选一执行。

## Mode A: bind-local（来自 grix-register 的首次交接）

输入参数（全必填）：

1. `mode=bind-local`
2. `agent_name`
3. `agent_id`
4. `api_endpoint`
5. `api_key`

执行规则：

1. 不做远端创建，直接执行本地绑定：

```bash
scripts/grix_agent_bind.py configure-local-openclaw \
  --agent-name <agent_name> \
  --agent-id <agent_id> \
  --api-endpoint '<api_endpoint>' \
  --api-key '<api_key>' \
  --apply
```

2. 绑定脚本会通过 `openclaw config set` 落配置，并在写入前临时把 `gateway.reload.mode` 切到 `hot`，避免当前安装对话被自动重启打断；不要在这条安装对话里追加 `openclaw gateway restart`。
3. 执行完后必须再做一次检查：

```bash
scripts/grix_agent_bind.py inspect-local-openclaw --agent-name <agent_name>
```

## Mode B: create-and-bind（已有主密钥时的后续管理）

输入参数：

1. `agentName`（必填）：`^[a-z][a-z0-9-]{2,31}$`
2. `describeMessageTool`（必填）：`actions` 非空
3. `accountId`（可选）
4. `avatarUrl`（可选）

执行规则：

1. 先检查 `~/.openclaw/openclaw.json` 的 `channels.grix.apiKey`。
2. 若缺失或为空，说明主通道还没完成，不做本模式，立刻切回 `grix-register`。
3. 若已存在，再调用 `grix_agent_admin` 创建远端 agent（仅一次，不自动重试）。
4. 创建成功后，执行本地绑定命令（同 Mode A）。
5. 整个 `create-and-bind` 流程里不要执行 `openclaw gateway restart`；优先让绑定脚本用 `gateway.reload.mode=hot` 保护当前会话不被自动重启打断。

## Guardrails（两种模式都适用）

1. Never ask user for website account/password.
2. `bind-local` 模式禁止再次回调 `grix-register`，避免循环路由。
3. 远端创建（Mode B）视为非幂等，不确认不自动重试。
4. 完整 `api_key` 仅一次性回传，不要重复明文回显。
5. 本地 `--apply` 没成功前，不得宣称配置完成。
6. 安装私聊进行中时，禁止手工修改 `openclaw.json` 后再执行 `openclaw gateway restart`。
7. 如果绑定脚本输出 `runtime_reload.restart_hint_detected=true`，说明当前 OpenClaw 版本仍提示“需要重启才生效”；此时不要自动重启，只能明确告诉用户“配置已写入，等待空闲时手动重启生效”。

## Error Handling Rules

1. `bind-local` 缺少字段：明确指出缺哪个字段并停止。
2. invalid name（Mode B）：要求用户提供合法小写英文名。
3. `403/20011`：提示 owner 授权 `agent.api.create`。
4. `401/10001`：检查本地 `agent_api_key` 或 grix 账号配置。
5. `409/20002`：要求更换 agent 名称。
6. 本地 apply 失败：返回失败命令与结果并停止。

## Response Style

1. 明确写出当前执行的是 `bind-local` 还是 `create-and-bind`。
2. 分阶段汇报：远端（如有）+ 本地绑定。
3. 明确说明本地是否已生效，失败则给具体原因。

## References

1. [references/api-contract.md](references/api-contract.md)
2. [scripts/grix_agent_bind.py](scripts/grix_agent_bind.py)
