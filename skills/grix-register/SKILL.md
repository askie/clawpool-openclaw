---
name: grix-register
description: 直接通过终端脚互，帮助用户通过邮箱完成 grix.dhf.pub 账号的自动注册，并在云端创建一个 provider_type=3 的主 Agent。最后将参数（agent_id, api_endpoint, api_key）交由 grix-admin 技能统一进行配置。
---

# Grix Register

由于 Grix 登录体系已被深度集成，你（AI）将全自动在终端代为操作，**不需要用户打开任何浏览器**。你的核心职责是：通过交互式提问获取用户的基本信息，利用本技能的终端脚本帮助用户完成邮箱注册，并代为申请一个用于通道对接的 `provider_type=3` Agent，最后把控制权转交 `grix-admin`。

## Workflow

### 0. 路由检查 (Routing Check)

在开口向用户索要邮箱或执行任何操作之前，你**必须**先检查本地配置文件 `~/.openclaw/openclaw.json`。
如果文件中 `channels.grix.apiKey` **已经存在且不为空**，说明主渠道早已配置完毕。你无需进行下面的任何注册流程，直接向用户反馈：“检测到本地已存在 Grix 密钥配置，将为您自动切换到 `grix-admin`”，然后立刻横向调用 `grix-admin` 技能接手后续任务。
如果**不存在**，则继续走下面的第1步。

### 1. 询问邮箱并发送验证码

1. 向用户询问他的 Email 地址。**不要让他们去网页端注册**，明确告诉他们你会在对话里帮他们完成一切。
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

*注：如果注册命令返回“邮箱已被注册”，你可以换用 `scripts/grix_auth.py login` 命令尝试（可能需要询问用户之前的密码，或者走 send-email-code / reset 流程，视具体情况而定，但优先假设是新用户走注册流程即可）。*

### 3. 创建云端 Agent

得到 `access_token` 后，紧接着询问用户给 Agent 起个名字，或者如果之前对话中已经明确了机器人的名字，直接使用该名字。然后不打断用户，直接运行下述命令创建或复用一个 `provider_type=3` 的主 Agent：

```bash
scripts/grix_auth.py create-api-agent --access-token "<token>" --agent-name "<agent名称>"
```

如果用户在云端尚未配置过同名 Agent，此命令会自动创建；如果存在同名的，则自动将其重置（轮换 API Key）并复用。

### 4. 移交配置给 grix-admin

第三步执行成功后，脚本会返回一些关键设定：
- `agent_id`
- `api_endpoint`
- `api_key`

保留并在对话中记住这三个参数。然后明确告知用户：“云端实体已自动搭建完毕，现在将立即调用 `grix-admin` 技能为您在本地主 Agent 生效配置”。
**随后转手把这三个参数直接派发/传导给 `grix-admin` 技能。**（注意：你不需要也不能在本技能中修改本地 `openclaw.json`，全交给 `grix-admin` 即可）
