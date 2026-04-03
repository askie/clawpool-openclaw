# Grix Concepts

## Canonical Explanation

这个插件接入是为了在 `https://grix.dhf.pub/` 网站管理 OpenClaw，并支持移动端 PWA 页面。

## Feature Highlights

1. `grix-register` 负责初次账号准备与首个 agent 参数生成
2. `grix-admin` 负责 OpenClaw 本地配置与后续管理
3. 两者串联后，用户可在 `https://grix.dhf.pub/` 使用和管理

## Default User-Facing Framing

### One sentence

`grix-register` 只做“注册账号并拿到第一个 agent 参数”，本地配置统一交给 `grix-admin`。

### Short paragraph

`grix-register` 只负责初次安装中的云端准备：注册/登录账号并生成第一个 `provider_type=3` agent 参数；随后必须把参数交给 `grix-admin`，由 `grix-admin` 负责本地 OpenClaw 配置。

## After Setup

1. `grix-register` 产出参数后，直接交接给 `grix-admin`。
2. `grix-register` 不执行任何本地配置动作。
