# OpenClaw Grix 插件

把 OpenClaw 接到 Grix 服务的统一插件，默认支持正式环境，也支持本地开发地址，包含：

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

### 2) 写入 Grix Channel 账号

用你已有的 Grix API agent 信息执行：

```bash
openclaw config set channels.grix.accounts.grix-main '{"name":"grix-main","enabled":true,"wsUrl":"wss://<YOUR_GRIX_HOST>/v1/agent-api/ws?agent_id=<YOUR_AGENT_ID>","agentId":"<YOUR_AGENT_ID>","apiKey":"<YOUR_API_KEY>"}' --strict-json
```

说明：

- `grix-main` 是本地账户名，可替换成你自己的名字（如 `ops`、`prod`）。
- `wsUrl` 建议直接写成最终可用地址，不要再依赖后续脚本补参数。

### 3) 开放工具权限

在 OpenClaw 配置里执行：

```bash
openclaw config set tools.profile '"coding"' --strict-json
openclaw config set tools.alsoAllow '["message","grix_query","grix_group","grix_agent_admin"]' --strict-json
openclaw config set tools.sessions.visibility '"agent"' --strict-json
```

### 4) 校验配置

```bash
openclaw config validate
openclaw config get --json channels.grix.accounts.grix-main
openclaw config get --json tools.alsoAllow
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

线上发布示例：

```json
{
  "channels": {
    "grix": {
      "enabled": true,
      "wsUrl": "wss://<YOUR_GRIX_HOST>/v1/agent-api/ws?agent_id=<YOUR_AGENT_ID>",
      "apiBaseUrl": "https://<YOUR_GRIX_HOST>/v1/agent-api",
      "agentId": "<YOUR_AGENT_ID>",
      "apiKey": "<YOUR_API_KEY>"
    }
  }
}
```

本地开发示例：

```json
{
  "channels": {
    "grix": {
      "enabled": true,
      "wsUrl": "ws://127.0.0.1:27189/v1/agent-api/ws?agent_id=<YOUR_AGENT_ID>",
      "apiBaseUrl": "http://127.0.0.1:27180/v1/agent-api",
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
          "wsUrl": "ws://127.0.0.1:27189/v1/agent-api/ws?agent_id=<OPS_AGENT_ID>",
          "apiBaseUrl": "http://127.0.0.1:27180/v1/agent-api",
          "agentId": "<OPS_AGENT_ID>",
          "apiKey": "<OPS_API_KEY>"
        },
        "prod": {
          "enabled": true,
          "wsUrl": "wss://<YOUR_GRIX_HOST>/v1/agent-api/ws?agent_id=<PROD_AGENT_ID>",
          "apiBaseUrl": "https://<YOUR_GRIX_HOST>/v1/agent-api",
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
| `apiBaseUrl` | 否（可用环境变量兜底） | 优先使用显式配置；否则按同一账号的 `wsUrl` 推导；本地 `ws://127.0.0.1:27189/...` 会默认映射成 `http://127.0.0.1:27180/v1/agent-api`；只有账号自己既没配 `apiBaseUrl` 也没配 `wsUrl` 时，才回退环境变量 | Grix HTTP API 地址。开发时可单独指向本地后端。 |
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
- `GRIX_WEB_BASE_URL`
- `GRIX_AGENT_ID`
- `GRIX_API_KEY`

注册脚本默认使用正式环境地址；如果要切到本地或其他部署，可额外设置：

- `GRIX_WEB_BASE_URL`

说明：

- `grix_query`、`grix_group`、`grix_agent_admin` 这些 HTTP 请求会优先使用当前账号自己的 `apiBaseUrl`。
- 如果当前账号没配 `apiBaseUrl`，会先按当前账号自己的 `wsUrl` 自动推导。
- 只有当前账号自己既没配 `apiBaseUrl`，也没提供可用的 `wsUrl` 时，才会回退到 `GRIX_AGENT_API_BASE` 或 `GRIX_WEB_BASE_URL`。
- `skills/grix-register/scripts/grix_auth.py` 会优先读取 `GRIX_WEB_BASE_URL`，再回落到正式环境地址；插件运行时也会把它当作 HTTP 基地址兜底。
- 多账号混用不同环境时，不建议设置全局 `GRIX_AGENT_API_BASE` / `GRIX_WEB_BASE_URL`，否则容易把一个账号的 HTTP 请求导到另一个环境。
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

## 空闲续聊与会话记忆

从 `0.4.16` 开始，插件支持在 Grix 会话长时间静默后，自动给下一轮对话补一段简短续聊摘要。这个能力只负责“续上刚才在聊什么”，不会改动你现有的一人多会话设计。

如果你要的是“像人一样先回忆最近重点，细节不够时再翻原话或搜旧记录，而且平时不额外吃很多 token”，需要同时打开下面几层能力：

- `plugins.entries.grix.config.resumeContext`
  作用：打开 Grix 插件自己的“空闲后续聊摘要”
- `agents.defaults.compaction.memoryFlush`
  作用：打开 OpenClaw 的压缩前长期沉淀
- `agents.defaults.memorySearch.experimental.sessionMemory` + `sources: ["memory", "sessions"]`
  作用：把旧会话也纳入搜索范围
- `tools.profile: "coding"` 或显式放开 `group:sessions` / `group:memory`
  作用：允许 agent 自己翻原话和搜旧记录
- 不要把 `plugins.entries.grix.hooks.allowPromptInjection` 设成 `false`
  作用：否则插件的续聊摘要不会生效

### 插件侧开关

可选配置：

```json
{
  "plugins": {
    "entries": {
      "grix": {
        "enabled": true,
        "config": {
          "resumeContext": {
            "enabled": true,
            "idleMinutes": 120,
            "recentMessages": 6,
            "recentToolResults": 2,
            "maxCharsPerItem": 220
          }
        }
      }
    }
  }
}
```

字段说明：

- `enabled`：是否启用空闲后续聊摘要。
- `idleMinutes`：静默多久后，下次开口时自动补摘要。
- `recentMessages`：摘要里保留多少条最近的用户/助手结论。
- `recentToolResults`：摘要里额外保留多少条最近工具结果。
- `maxCharsPerItem`：每条摘要的最大长度。

前提：

- `plugins.entries.grix.hooks.allowPromptInjection` 不要设成 `false`。
- 这层只负责“少量续聊提示”，不会替代长期记忆或旧会话检索。

### OpenClaw 侧推荐配置

如果你希望同时得到“会话压缩”“长期沉淀”“可回头搜旧会话”这三件事，还要把 OpenClaw 自身的能力一起打开：

```json
{
  "agents": {
    "defaults": {
      "compaction": {
        "mode": "safeguard",
        "memoryFlush": {
          "enabled": true,
          "softThresholdTokens": 4000
        }
      },
      "memorySearch": {
        "enabled": true,
        "provider": "ollama",
        "remote": {
          "baseUrl": "http://127.0.0.1:11434"
        },
        "model": "nomic-embed-text",
        "experimental": {
          "sessionMemory": true
        },
        "sources": [
          "memory",
          "sessions"
        ],
        "sync": {
          "watch": true
        }
      }
    }
  },
  "tools": {
    "profile": "coding"
  }
}
```

每一项配置分别打开什么功能：

- `compaction.mode = "safeguard"`
  作用：允许 OpenClaw 在上下文逼近上限时做会话压缩
- `compaction.memoryFlush.enabled = true`
  作用：在压缩前先把重要信息沉淀到长期记忆
- `memorySearch.enabled = true`
  作用：打开记忆搜索
- `memorySearch.experimental.sessionMemory = true`
  作用：把会话记录也纳入索引
- `memorySearch.sources = ["memory", "sessions"]`
  作用：同时搜索长期记忆和旧会话
- `memorySearch.sync.watch = true`
  作用：记忆文件更新后自动进索引
- `tools.profile = "coding"`
  作用：直接包含 `group:sessions` 和 `group:memory`，让 agent 能用 `sessions_history`、`memory_search`、`memory_get`

如果你不用 `coding` / `full`，至少要显式放开这些工具：

```json
{
  "tools": {
    "allow": [
      "group:sessions",
      "group:memory"
    ]
  }
}
```

最终效果是四层一起工作：

- Grix 插件只在静默后给一小段续聊摘要，平时不额外灌很多历史
- OpenClaw 在长对话快压缩前先把长期要记的内容沉淀下来
- OpenClaw 压缩后保留可延续的摘要，不需要每轮都带整段聊天
- 需要细节时，agent 再自己翻 `sessions_history` 或用 `memory_search` 搜旧记录

### Agent 可调用工具

- `grix_query`：`contact_search`、`session_search`、`message_history`
- `grix_group`：`create`、`detail`、`leave`、`add_members`、`remove_members`、`update_member_role`、`update_all_members_muted`、`update_member_speaking`、`dissolve`
- `grix_agent_admin`：创建 `provider_type=3` 的 Grix API agent（只创建远端 agent，不会直接改本地 `channels.grix`）

工具调用约束：

- 以上三个工具都必须显式传入 `accountId`。
- 如果工具调用上下文存在当前连接账号，则 `accountId` 必须与上下文账号一致；不一致会直接拒绝执行。

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
