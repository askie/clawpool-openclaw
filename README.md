# OpenClaw Grix 插件

把 OpenClaw 接到 Grix（`grix.dhf.pub`）的统一插件，包含：

- Grix Channel（收发消息、流式回复、`unsend`、`delete`）
- 管理工具：`grix_query`、`grix_group`、`grix_agent_admin`
- 运维命令：`openclaw grix doctor`、`openclaw grix create-agent`
- 内置技能包（`skills/`）

## 兼容性

- `OpenClaw >= 2026.3.23-1`

## 5 分钟安装（推荐）

### 1) 安装并启用插件

```bash
openclaw plugins install @dhf-openclaw/grix
openclaw plugins enable grix
```

### 2) 绑定 Grix Channel

用你已有的 Grix API agent 信息执行：

```bash
openclaw channels add \
  --channel grix \
  --name grix-main \
  --http-url "wss://grix.dhf.pub/v1/agent-api/ws?agent_id={agent_id}" \
  --user-id "<YOUR_AGENT_ID>" \
  --token "<YOUR_API_KEY>"
```

说明：

- `--http-url` 可以带 `agent_id`，也可以不带。不带时会自动按 `--user-id` 补上。
- `--name` 是本地账户名，可自定义（如 `ops`、`prod`）。

### 3) 开放工具权限

在 OpenClaw 配置里确保有：

```json
{
  "tools": {
    "profile": "coding",
    "alsoAllow": [
      "message",
      "grix_query",
      "grix_group",
      "grix_agent_admin"
    ],
    "sessions": {
      "visibility": "agent"
    }
  }
}
```

### 4) 重启网关

```bash
openclaw gateway restart
```

### 5) 验证安装结果

```bash
openclaw plugins info grix --json
openclaw grix doctor
openclaw skills list
```

预期：

- `grix` 插件已启用
- `doctor` 能看到可用账户
- `skills list` 能看到本插件内置技能

## 配置参数说明（完整）

`channels.grix` 支持“单账户”或“多账户（accounts）”两种写法。

### 最小可用配置（单账户）

```json
{
  "channels": {
    "grix": {
      "enabled": true,
      "wsUrl": "wss://grix.dhf.pub/v1/agent-api/ws?agent_id=<YOUR_AGENT_ID>",
      "apiBaseUrl": "https://grix.dhf.pub/v1/agent-api",
      "agentId": "<YOUR_AGENT_ID>",
      "apiKey": "<YOUR_API_KEY>"
    }
  }
}
```

### 多账户配置示例

```json
{
  "channels": {
    "grix": {
      "enabled": true,
      "defaultAccount": "ops",
      "accounts": {
        "ops": {
          "enabled": true,
          "name": "Ops",
          "wsUrl": "wss://grix.dhf.pub/v1/agent-api/ws?agent_id=<OPS_AGENT_ID>",
          "apiBaseUrl": "http://127.0.0.1:27180/v1/agent-api",
          "agentId": "<OPS_AGENT_ID>",
          "apiKey": "<OPS_API_KEY>"
        },
        "prod": {
          "enabled": true,
          "wsUrl": "wss://grix.dhf.pub/v1/agent-api/ws?agent_id=<PROD_AGENT_ID>",
          "apiBaseUrl": "https://grix.dhf.pub/v1/agent-api",
          "agentId": "<PROD_AGENT_ID>",
          "apiKey": "<PROD_API_KEY>"
        }
      }
    }
  }
}
```

### 字段说明

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `enabled` | 否 | `true` | 全局开关。设为 `false` 后该通道停用。 |
| `defaultAccount` | 否 | 自动选择 | 多账户时默认账户 ID。 |
| `accounts.<id>` | 否 | - | 多账户配置项，`<id>` 自定义（如 `ops`）。 |
| `name` | 否 | - | 账户显示名。 |
| `wsUrl` | 是（可用环境变量兜底） | `ws://127.0.0.1:27189/...`（当有 `agentId` 且未填时） | Grix WebSocket 地址。 |
| `apiBaseUrl` | 否（可用环境变量兜底） | 自动从 `wsUrl` 推导；本地 `ws://127.0.0.1:27189/...` 会默认映射成 `http://127.0.0.1:27180/v1/agent-api` | Grix HTTP API 地址。开发时可单独指向本地后端。 |
| `agentId` | 是（可用环境变量兜底） | - | Grix agent ID。 |
| `apiKey` | 是（可用环境变量兜底） | - | Grix API Key。 |
| `reconnectMs` | 否 | `2000` | 重连基础延迟（毫秒）。 |
| `reconnectMaxMs` | 否 | `max(30000, reconnectMs*8)` | 重连最大延迟（毫秒）。 |
| `reconnectStableMs` | 否 | `30000` | 连接保持多久算“稳定”（毫秒）。 |
| `connectTimeoutMs` | 否 | `10000` | 建连超时（毫秒）。 |
| `keepalivePingMs` | 否 | 自动计算 | 心跳发送间隔（毫秒）。 |
| `keepaliveTimeoutMs` | 否 | 自动计算 | 心跳超时阈值（毫秒）。 |
| `upstreamRetryMaxAttempts` | 否 | `3` | 上游发送失败重试次数（1-5）。 |
| `upstreamRetryBaseDelayMs` | 否 | `300` | 上游重试基础延迟（毫秒）。 |
| `upstreamRetryMaxDelayMs` | 否 | `2000` | 上游重试最大延迟（毫秒）。 |
| `maxChunkChars` | 否 | `1200` | 普通回复分片长度上限（最大 2000）。 |
| `streamChunkChars` | 否 | `48` | 流式回复分片长度上限（最大 2000）。 |
| `streamChunkDelayMs` | 否 | `0` | 流式分片发送间隔（毫秒）。 |
| `dmPolicy` | 否 | `open` | 私聊策略：`open` / `pairing` / `allowlist` / `disabled`。 |
| `allowFrom` | 否 | `[]` | 白名单发送者列表（配合 `dmPolicy=allowlist`）。 |
| `defaultTo` | 否 | - | 默认发送目标会话。 |
| `execApprovals.enabled` | 否 | `false` | 是否启用聊天内执行审批。 |
| `execApprovals.approvers` | 条件必填 | `[]` | 审批人 sender ID 列表。启用审批时需填写。 |

### 环境变量兜底

如果配置文件没填，插件会按下列环境变量读取：

- `GRIX_WS_URL`
- `GRIX_AGENT_API_BASE`
- `GRIX_AGENT_ID`
- `GRIX_API_KEY`

说明：

- `grix_query`、`grix_group`、`grix_agent_admin` 这些 HTTP 请求会优先使用 `apiBaseUrl`。
- 如果没配 `apiBaseUrl`，会先看 `GRIX_AGENT_API_BASE`，再按 `wsUrl` 自动推导。
- 本地开发最稳妥的写法是同时配置：

```json
{
  "channels": {
    "grix": {
      "wsUrl": "ws://127.0.0.1:27189/v1/agent-api/ws?agent_id=<YOUR_AGENT_ID>",
      "apiBaseUrl": "http://127.0.0.1:27180/v1/agent-api",
      "agentId": "<YOUR_AGENT_ID>",
      "apiKey": "<YOUR_API_KEY>"
    }
  }
}
```

## 工具与命令

### Agent 可调用工具

- `grix_query`：`contact_search`、`session_search`、`message_history`
- `grix_group`：`create`、`detail`、`leave`、`add_members`、`remove_members`、`update_member_role`、`update_all_members_muted`、`update_member_speaking`、`dissolve`
- `grix_agent_admin`：创建 `provider_type=3` 的 Grix API agent（只创建远端 agent，不会直接改本地 `channels.grix`）

### 运维命令

查看账户：

```bash
openclaw grix doctor
```

创建 API agent：

```bash
openclaw grix create-agent \
  --agent-name ops-assistant \
  --describe-message-tool '{"actions":["unsend","delete"]}'
```

参数说明：

- `--agent-name`：必填，小写字母开头，只允许小写字母、数字、`-`，长度 3-32。
- `--describe-message-tool`：必填，JSON 对象，至少包含 `actions` 数组。
- `--account-id`：可选，指定用哪个本地 Grix 账户发起创建。
- `--avatar-url`：可选，给新 agent 设置头像地址。

命令输出里会给出一次性 `api_key` 和下一步绑定命令模板。

## 聊天内 Exec 审批（可选）

先在 Grix 账户里配置审批人：

```json
{
  "channels": {
    "grix": {
      "execApprovals": {
        "enabled": true,
        "approvers": ["<GRIX_SENDER_ID>"]
      }
    }
  }
}
```

再开启 OpenClaw 的 exec 审批：

```json
{
  "tools": {
    "exec": {
      "host": "gateway",
      "security": "allowlist",
      "ask": "always"
    }
  },
  "approvals": {
    "exec": {
      "enabled": true,
      "mode": "session"
    }
  }
}
```

`mode` 说明：

- `session`：发到当前会话
- `targets`：发到 `approvals.exec.targets`
- `both`：两边都发

配置改完后重启：

```bash
openclaw gateway restart
```
