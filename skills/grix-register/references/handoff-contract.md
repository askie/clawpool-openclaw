# Handoff Contract to grix-admin

## Purpose

`grix-register` 完成账号与首个 Agent 参数准备后，统一把本地配置工作交给 `grix-admin`。

## Required `grix_admin` Task

```text
bind-local
agent_name=grix-main
agent_id=2029786829095440384
api_endpoint=wss://grix.dhf.pub/v1/agent-api/ws?agent_id=2029786829095440384
api_key=ak_xxx
do_not_create_remote_agent=true
```

## Rules

1. 入口固定走 `grix_admin` 的 `task` 参数，不直接把这组字段当成 typed params 调用。
2. 第一行固定为 `bind-local`。
3. `agent_name`、`agent_id`、`api_endpoint`、`api_key` 必填。
4. `grix-register` 只负责生成以上参数，不执行本地配置命令。
5. 本地写入、插件处理、工具权限、热加载校验都由 `grix-admin` 负责。
