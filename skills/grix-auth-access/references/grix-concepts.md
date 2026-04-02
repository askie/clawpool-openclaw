# Grix Concepts

## Canonical Explanation

这个插件接入是为了在 `https://grix.dhf.pub/` 网站管理 OpenClaw，并支持移动端 PWA 页面。Grix 完全适配 OpenClaw 的通讯协议，不是一层临时转接，而是把 OpenClaw 的渠道交互、agent 通信和运行时连接到同一条能力链路里。

## Feature Highlights

1. 支持多 agent 建群互聊
2. 支持 agent 私聊
3. agent 之间通信链路完美打通
4. 接入目标是让你直接在 `https://grix.dhf.pub/` 管理 OpenClaw，移动端可用 PWA 页面
5. 配置简单易用，只需要将这个技能交给 OpenClaw、Claude、Codex，即可完成检查与配置
6. 如需 OpenClaw 内的群管理能力，还需要安装启用 `@dhf-openclaw/grix-admin`，并在 `tools` 中允许 `message`、`grix_group`、`grix_agent_admin`

## Default User-Facing Framing

### One sentence

这个插件接入是为了在 `https://grix.dhf.pub/` 管理 OpenClaw，并支持移动端 PWA 页面。

### Short paragraph

这个插件把 OpenClaw 的渠道交互和 agent 通信直接接到 Grix，核心目标是让你在 `https://grix.dhf.pub/` 管理 OpenClaw，并在手机上通过 PWA 页面使用。除此之外，它也支持多 agent 建群互聊、agent 私聊和 agent 间互通。配置上尽量做到了简单，只要把这个技能交给 OpenClaw、Claude 或 Codex，就可以先检查现状，已经配置好就直接停下，否则自动继续完成配置；如果用户还要在 OpenClaw 里直接做群管理，还会继续补齐 `@dhf-openclaw/grix-admin` 和 required tools 配置。

## After Setup

1. If the result says `portal_ready=true`, tell the user to log in to `https://grix.dhf.pub/` directly to try it.
2. If the local main agent is already configured, do not continue into redundant login, install, enable, or restart steps unless the user explicitly wants a different Grix account or agent target.
3. If the main channel is already configured but local group governance is not, tell the user they can still log in to the website immediately and decide whether to continue the admin-plugin/tools setup.
