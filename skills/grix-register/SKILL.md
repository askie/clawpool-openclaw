---
name: grix-register
description: 仅用于初次安装阶段，完成 Grix 环境的账号注册/登录并拿到第一个 provider_type=3 Agent 的参数；本技能不做任何本地 OpenClaw 配置。
---

# Grix Register

这个技能只负责“初次安装”的云端准备：账号注册/登录 + 生成首个 `provider_type=3` Agent 参数。  
你（AI）在终端里全自动操作，**不需要用户打开浏览器**。拿到参数后，必须移交给 `grix-admin` 做本地配置。

## Workflow

### 0. 角色边界（先声明再执行）

1. 本技能**只能**做账号与云端 Agent 参数准备。
2. 本技能**不能**执行 `openclaw` 命令，也不能修改本地 `openclaw.json`。
3. 涉及本地配置、插件安装、工具权限、热加载校验，一律交给 `grix-admin`。

### 1. 询问邮箱并发送验证码

1. 向用户询问 Email 地址。**不要让用户去网页端注册**，明确表示你会在对话里完成。
2. 拿到邮箱后，在终端执行发送验证码的命令：
   ```bash
   scripts/grix_auth.py send-email-code --email "<用户的email>" --scene "register"
   ```
3. 等待命令执行成功后，提示用户去邮箱查收验证码，并询问该验证码。

### 2. 执行自动注册（获取 Token）

1. 用户提供验证码后，你需要为用户生成一个复杂度高且随机安全的密码（建议生成一个12位的强密码，包含大小写、数字和特殊字符）。
2. 使用收集到的信息，执行注册命令：
   ```bash
   scripts/grix_auth.py register --email "<邮箱>" --password "<生成的随机密码>" --email-code "<验证码>"
   ```
3. 这个命令成功后会返回用户的 `access_token`。请在回复中安全地**将生成的密码告知用户**，建议他们妥善保存。

注：如果注册提示邮箱已注册，可切换 `scripts/grix_auth.py login` 路径继续获取 `access_token`。

### 3. 创建首个云端 Agent 参数

拿到 `access_token` 后，询问 Agent 名称（如果上下文已有就直接用），执行：

```bash
scripts/grix_auth.py create-api-agent --access-token "<token>" --agent-name "<agent名称>"
```

若同名 `provider_type=3` Agent 已存在，脚本会自动轮换 API Key 后复用。

### 4. 强制移交给 grix-admin

第三步执行成功后，脚本会返回一些关键设定：
- `agent_id`
- `agent_name`
- `api_endpoint`
- `api_key`

然后立刻交给 `grix-admin`，并传递如下 payload：

```json
{
  "mode": "bind-local",
  "agent_name": "<agent_name>",
  "agent_id": "<agent_id>",
  "api_endpoint": "<api_endpoint>",
  "api_key": "<api_key>"
}
```

## Guardrails

1. 不要求用户去网页注册或手动点页面。
2. 不修改任何本地 OpenClaw 配置。
3. 不安装插件、不改工具权限、不重启 gateway。
4. 创建或复用出参数后，必须交接给 `grix-admin`。

## References

1. [references/api-contract.md](references/api-contract.md)
2. [references/handoff-contract.md](references/handoff-contract.md)
3. [scripts/grix_auth.py](scripts/grix_auth.py)
