# Clawpool 插件发布清单

本文件用于记录已发布事实，以及后续版本发布时的执行清单。

> 仅适用于 channel 插件 `@dhfpub/clawpool-openclaw`。`@dhfpub/clawpool-openclaw-admin` 使用独立清单：`openclaw_plugins/clawpool-admin/PUBLISH_CHECKLIST.md`。

## 已发布记录

### `0.3.9`（2026-03-21 CST）

- npm 包名：`@dhfpub/clawpool-openclaw`
- 发布状态：已发布到 npm 官方源
- 发布执行人：`askie`
- 发布时间：`2026-03-21 00:28 CST`
- 计划内容：补充 exec approval 配置说明，并将 account id 归一化 helper 内聚到插件内部，避免发布门禁依赖额外开发环境
- 发布查询：`npm view @dhfpub/clawpool-openclaw version dist-tags time --json --registry=https://registry.npmjs.org/`
- 已验证结果：
  - `npm test` 通过
  - `npm run pack:dry-run` 通过
  - npm `latest` 已更新为 `0.3.9`

### `0.3.8`（2026-03-20 CST）

- npm 包名：`@dhfpub/clawpool-openclaw`
- 发布状态：已发布到 npm 官方源
- 发布执行人：`askie`
- 发布时间：`2026-03-20 20:09 CST`
- 计划内容：发布 exec approval chat cards 与相关 e2e helper 能力，覆盖审批卡片展示、审批指令解析与状态回传链路
- 发布查询：`npm view @dhfpub/clawpool-openclaw version dist-tags time --json --registry=https://registry.npmjs.org/`
- 已验证结果：
  - `npm test` 通过
  - `npm run pack:dry-run` 通过
  - npm `latest` 已更新为 `0.3.8`

### `0.3.7`（2026-03-20 CST）

- npm 包名：`@dhfpub/clawpool-openclaw`
- 发布状态：已发布到 npm 官方源
- 发布执行人：`askie`
- 发布时间：`2026-03-20 16:27 CST`
- 计划内容：补齐仓库内 npm 发布自动化，默认自动升级版本，并在 npm web auth 需要授权时自动拉起浏览器
- 发布查询：`npm view @dhfpub/clawpool-openclaw version dist-tags time --json --registry=https://registry.npmjs.org/`
- 已验证结果：
  - `npm test` 通过
  - `npm run pack:dry-run` 通过
  - npm `latest` 已更新为 `0.3.7`

### `0.3.5`（2026-03-20 CST）

- npm 包名：`@dhfpub/clawpool-openclaw`
- 发布状态：已发布到 npm 官方源
- 发布执行人：`askie`
- 发布时间：`2026-03-20 10:46 CST`
- 计划内容：支持 owner stop agent output 流程，并补强 stop-output 相关链路与可观测性
- 发布查询：`npm view @dhfpub/clawpool-openclaw version dist-tags time --json --registry=https://registry.npmjs.org/`
- 已验证结果：
  - `npm test` 通过
  - `npm run pack:dry-run` 通过
  - npm `latest` 已更新为 `0.3.5`

### `0.3.4`（2026-03-19 CST）

- npm 包名：`@dhfpub/clawpool-openclaw`
- 发布状态：已发布到 npm 官方源
- 发布执行人：`askie`
- 发布时间：`2026-03-19 13:35 CST`
- 计划内容：补强入站 `event_msg` 去重，避免 ClawPool 重试导致同一事件重复投递
- 发布查询：`npm view @dhfpub/clawpool-openclaw version dist-tags time --json --registry=https://registry.npmjs.org/`
- 已验证结果：
  - `npm test` 通过
  - `npm run pack:dry-run` 通过
  - npm `latest` 已更新为 `0.3.4`

### `0.3.3`（2026-03-19 CST）

- npm 包名：`@dhfpub/clawpool-openclaw`
- 发布状态：已发布到 npm 官方源
- 发布执行人：`askie`
- 发布时间：`2026-03-19 10:19 CST`
- 计划内容：补强 Agent API 出站可靠性，新增 `send_msg` 限速重试、超长文本/媒体标题切分，以及 `event_result` 回传
- 发布查询：`npm view @dhfpub/clawpool-openclaw version dist-tags time --json --registry=https://registry.npmjs.org/`
- 已验证结果：
  - `npm test` 通过
  - `npm run pack:dry-run` 通过
  - OpenClaw 隔离 profile 下本地 tarball 安装、启用、`plugins doctor`、`skills info clawpool-auth-access` 通过
  - OpenClaw 隔离 profile 下从 npm 安装 `@dhfpub/clawpool-openclaw`、启用、`plugins info`、`plugins doctor`、`skills list` 通过
  - OpenClaw 隔离 profile 下从 npm 安装 `@dhfpub/clawpool-openclaw-admin@0.2.2`、启用、`plugins info`、`plugins doctor` 通过
  - npm `latest` 已更新为 `0.3.3`

### `0.3.2`（2026-03-18 CST）

- npm 包名：`@dhfpub/clawpool-openclaw`
- 发布状态：已发布到 npm 官方源
- 发布执行人：`askie`
- 发布时间：`2026-03-18 21:23 CST`
- 计划内容：静默化 `message-unsend` 回撤流程，避免产生确认回复，并同步技能说明与流程图
- 发布查询：`npm view @dhfpub/clawpool-openclaw version dist-tags --registry=https://registry.npmjs.org`
- 已验证结果：
  - `npm test` 通过
  - `npm run pack:dry-run` 通过
  - npm `latest` 已更新为 `0.3.2`

### `0.3.1`（2026-03-18 CST）

- npm 包名：`@dhfpub/clawpool-openclaw`
- 发布状态：已发布到 npm 官方源
- 发布执行人：`askie`
- 发布时间：`2026-03-18 08:13 CST`
- 计划内容：配套 `@dhfpub/clawpool-openclaw-admin@0.2.2` 同步补丁发版，保持插件对外版本演进一致
- 发布查询：`npm view @dhfpub/clawpool-openclaw version dist-tags --registry=https://registry.npmjs.org`
- 已验证结果：
  - `npm test` 通过
  - `npm run pack:dry-run` 通过
  - npm `latest` 已更新为 `0.3.1`

### `0.3.0`（2026-03-17 CST）

- npm 包名：`@dhfpub/clawpool-openclaw`
- 发布状态：已发布到 npm 官方源
- 发布执行人：`askie`
- 发布时间：`2026-03-17 16:47 CST`
- 计划内容：`clawpool-auth-access` 改为邮箱验证码直登流程，不再要求注册图形验证码
- 发布查询：`npm view @dhfpub/clawpool-openclaw version dist-tags --registry=https://registry.npmjs.org`
- 已验证结果：
  - `npm test` 通过
  - `npm run pack:dry-run` 通过
  - OpenClaw 隔离 profile 下本地 tarball 安装、启用、skills 可见性检查通过
  - OpenClaw 隔离 profile 下从 npm 安装 `@dhfpub/clawpool-openclaw`、启用、`plugins info`、skills 可见性检查通过
  - npm `latest` 已更新为 `0.3.0`

### `0.2.1`（2026-03-17 CST）

- npm 包名：`@dhfpub/clawpool-openclaw`
- 发布状态：已发布到 npm 官方源
- 发布执行人：`askie`
- 发布时间：`2026-03-17 10:42 CST`
- 计划内容：README 补充与 `@dhfpub/clawpool-openclaw-admin` 的职责边界、安装顺序与交叉引用
- 发布查询：`npm view @dhfpub/clawpool-openclaw version dist-tags --registry=https://registry.npmjs.org`
- 已验证结果：
  - `npm test` 通过
  - `npm run pack:dry-run` 通过
  - npm `latest` 已更新为 `0.2.1`

### `0.2.0`（2026-03-17 CST）

- npm 包名：`@dhfpub/clawpool-openclaw`
- 发布状态：已发布到 npm 官方源
- 发布执行人：`askie`
- 发布时间：`2026-03-17 10:36 CST`
- 计划内容：bundled `clawpool-auth-access` onboarding skill、`@dhfpub/clawpool-openclaw-admin` 联动说明、required tools 配置要求
- 发布查询：`npm view @dhfpub/clawpool-openclaw version dist-tags --registry=https://registry.npmjs.org`
- 已验证结果：
  - `npm test` 通过
  - `npm run pack:dry-run` 通过
  - npm `latest` 已更新为 `0.2.0`
  - OpenClaw 隔离 profile 下从 npm 安装 `@dhfpub/clawpool-openclaw`、启用后，`skills info clawpool-auth-access` 可见

### `0.1.3`（2026-03-17 CST）

- npm 包名：`@dhfpub/clawpool-openclaw`
- 发布状态：已发布到 npm 官方源
- 发布执行人：`askie`
- 发布时间：`2026-03-17 05:37 CST`
- 计划内容：channel action discoverability 修正、account 启用与配置校验补强、README 拆分为 transport-only 说明
- 发布查询：`npm view @dhfpub/clawpool-openclaw version dist-tags --registry=https://registry.npmjs.org`
- 已验证结果：
  - `npm test` 通过
  - `npm run pack:dry-run` 通过
  - OpenClaw 隔离 profile 下本地 tarball 安装、启用、`plugins doctor` 通过
  - OpenClaw 隔离 profile 下从 npm 安装 `@dhfpub/clawpool-openclaw`、启用、`plugins info`、`plugins doctor` 通过
  - npm `latest` 已更新为 `0.1.3`

### `0.1.2`（2026-03-16 CST）

- npm 包名：`@dhfpub/clawpool-openclaw`
- 发布状态：已发布到 npm 官方源
- 发布执行人：`askie`
- 发布时间：`2026-03-16 10:27 CST`
- 计划内容：README 安装、更新与网关生效说明修正
- 发布查询：`npm view @dhfpub/clawpool-openclaw version dist-tags --registry=https://registry.npmjs.org`
- 已验证结果：
  - `npm test` 通过
  - `npm run pack:dry-run` 通过
  - tarball 包含更新后的 `README.md`
  - npm `latest` 已更新为 `0.1.2`

### `0.1.1`（2026-03-16 CST）

- npm 包名：`@dhfpub/clawpool-openclaw`
- 发布状态：已发布到 npm 官方源
- 发布执行人：`askie`
- 发布时间：`2026-03-16 10:17 CST`
- 发布查询：`npm view @dhfpub/clawpool-openclaw version dist-tags --registry=https://registry.npmjs.org`
- 已验证结果：
  - `npm test` 通过
  - `npm run pack:dry-run` 通过
  - OpenClaw 隔离 profile 下 `plugins install -l`、`enable`、`list`、`doctor` 通过
  - OpenClaw 隔离 profile 下从 npm 安装 `@dhfpub/clawpool-openclaw`、启用、`plugins doctor` 通过

### `0.1.0`（2026-03-15 CST）

- npm 包名：`@dhfpub/clawpool-openclaw`
- 发布状态：已发布到 npm 官方源
- 发布查询：`npm view @dhfpub/clawpool-openclaw version dist-tags --registry=https://registry.npmjs.org`
- 安装回归：`openclaw plugins install @dhfpub/clawpool-openclaw`
- 已验证结果：
  - `npm test` 通过
  - `npm run pack:dry-run` 通过
  - OpenClaw 安装、启用、`plugins doctor` 通过
  - 完成一次真实 ClawPool 会话出站验证

## 0. 基本信息（每次后续发布必须填写）

- [ ] 插件目录：`openclaw_plugins/clawpool`
- [ ] npm 包名：`@dhfpub/clawpool-openclaw`
- [ ] 目标版本（SemVer）：`______`
- [ ] 发布执行人：`______`
- [ ] 发布时间（CST）：`______`
- [ ] 变更说明链接（PR/Issue）：`______`
- [ ] 风险等级：`低 / 中 / 高`
- [ ] 回滚负责人：`______`

## 1. 发布门禁（必须全部通过）

- [ ] `openclaw.plugin.json` 合法，且包含 `id`、`channels`、`skills`、`configSchema`
- [ ] `package.json` 包含 `openclaw.extensions`
- [ ] `package.json` 包含 `openclaw.install.npmSpec/localPath/defaultChoice`
- [ ] `openclaw.extensions == ./dist/index.js`
- [ ] 渠道元数据一致：
  - [ ] `openclaw.channel.id == clawpool`
- [ ] npm 包元数据完整：
  - [ ] `repository`
  - [ ] `license`
  - [ ] `bugs`
  - [ ] `homepage`
  - [ ] `files`（限制发布内容）
  - [ ] `publishConfig.access == public`
- [ ] GitHub 源码仓库为公开可访问
- [ ] 仓库 README 包含安装与配置说明
- [ ] 仓库 README 包含 bundled skills / onboarding 说明
- [ ] 仓库 README 明确说明何时需要同时安装 `@dhfpub/clawpool-openclaw-admin`
- [ ] 仓库 README 交叉引用 `openclaw_plugins/clawpool-admin/README.md`
- [ ] 仓库 Issue Tracker 可用（用于问题收敛）

## 2. 阶段 A：本地校验

- [ ] 编译产物生成：
  - 命令：`npm install`
  - 命令：`npm run build`
  - 验收：生成 `dist/index.js`
- [ ] 打包预演：
  - 命令：`npm run pack:dry-run`
  - 验收：tarball 文件列表与预期一致，包含 `dist/index.js`、插件清单、README、LICENSE、`skills/**`，无 `src/*.ts`、sourcemap、测试与发布清单
- [ ] 本地链接安装：
  - 当前 OpenClaw `2026.3.13` 下，优先使用本地 tarball 安装回归而不是目录安装
  - 命令：`cd openclaw_plugins/clawpool && npm pack --ignore-scripts`
  - 命令：`openclaw --profile <name> plugins install <repo-root>/openclaw_plugins/clawpool/*.tgz`
- [ ] 启用并体检：
  - 命令：`openclaw --profile <name> plugins enable clawpool`
  - 命令：`openclaw --profile <name> plugins list`
  - 命令：`openclaw --profile <name> plugins doctor`
- [ ] admin 插件联动验证：
  - 命令：`openclaw --profile <name> plugins install @dhfpub/clawpool-openclaw-admin`
  - 命令：`openclaw --profile <name> plugins enable clawpool-admin`
  - 命令：`openclaw --profile <name> plugins info clawpool-admin --json`
- [ ] 技能可见性验证：
  - 命令：`openclaw --profile <name> skills list`
  - 命令：`openclaw --profile <name> skills info clawpool-auth-access`
  - 验收：输出包含 `clawpool-auth-access`
- [ ] 技能打包验证：
  - 验收：tarball 和本地安装结果都包含 `skills/clawpool-auth-access/SKILL.md`
- [ ] required tools 配置验证：
  - 验收：profile 配置中的 `tools.profile == coding`
  - 验收：`tools.alsoAllow` 包含 `message`、`clawpool_group`、`clawpool_agent_admin`
  - 验收：`tools.sessions.visibility == agent`
- [ ] 渠道探测：
  - 命令：`openclaw channels list`
  - 命令：`openclaw channels status --probe --timeout 5000`
- [ ] 与 ClawPool Agent API 完成一次端到端收发验证
- [ ] `clawpool-auth-access` 至少完成一次真实 `inspect-openclaw` 或 bootstrap 冒烟验证
  - 验收：缺少 `clawpool-admin` 或 required tools 时，能明确返回未完成状态
  - 验收：补齐后 `inspection_state == already_configured`

## 3. 阶段 B：发布到 npm

- [ ] 统一入口：
  - 命令：`./scripts/release.sh plugin-clawpool-npm`
  - 默认行为：自动执行 `npm ci`、`npm test`、`npm run pack:dry-run`
  - 默认行为：自动执行 patch 升版；可用 `CLAWPOOL_NPM_VERSION_BUMP_LEVEL=minor|major` 覆盖
  - 可选关闭：`AUTO_BUMP_CLAWPOOL_NPM_VERSION=0 ./scripts/release.sh plugin-clawpool-npm`
  - 浏览器授权：当 `npm login` 或 `npm publish` 触发 web auth 时，脚本会自动回车并拉起浏览器；看到授权页面后由人工完成确认
- [ ] 确认账号具备 `@dhfpub` scope 发布权限
- [ ] 登录校验：
  - 命令：`npm login --auth-type=web --registry=https://registry.npmjs.org`
  - 命令：`npm whoami --registry=https://registry.npmjs.org`
- [ ] 更新 `package.json` 版本号
- [ ] 正式发布：
  - 命令：`npm publish --access public --registry=https://registry.npmjs.org`
- [ ] 发布后查询：
  - 命令：`npm view @dhfpub/clawpool-openclaw version dist-tags --registry=https://registry.npmjs.org`

## 4. 阶段 C：从 npm 安装回归

- [ ] 全新安装验证：
  - 命令：`openclaw plugins install @dhfpub/clawpool-openclaw`
- [ ] 启用与体检：
  - 命令：`openclaw plugins enable clawpool`
  - 命令：`openclaw plugins doctor`
- [ ] bundled skills 回归：
  - 命令：`openclaw skills list`
  - 命令：`openclaw skills info clawpool-auth-access`
  - 验收：从 npm 安装后的插件仍可见 `clawpool-auth-access`
- [ ] admin 联动回归：
  - 命令：`openclaw plugins install @dhfpub/clawpool-openclaw-admin`
  - 命令：`openclaw plugins enable clawpool-admin`
  - 命令：`openclaw plugins info clawpool-admin --json`
- [ ] required tools 回归：
  - 验收：最终 `openclaw.json` 中 `tools.alsoAllow` 包含 `message`、`clawpool_group`、`clawpool_agent_admin`
  - 验收：最终 `tools.sessions.visibility == agent`
- [ ] 功能回归：
  - [ ] `event_msg` 入站触发正常
  - [ ] `send_msg`/`client_stream_chunk` 出站正常
  - [ ] 基础重连逻辑正常（断开后可恢复）

## 5. 阶段 D：提交官方社区插件收录

- [ ] fork 官方仓库：`openclaw/openclaw`
- [ ] 修改文件：`docs/plugins/community.md`
- [ ] 按官方格式新增条目（必须包含）：
  - [ ] 插件名
  - [ ] npm 包名
  - [ ] GitHub 仓库 URL
  - [ ] 一句话描述
  - [ ] 安装命令（`openclaw plugins install @dhfpub/clawpool-openclaw`）
- [ ] 创建 PR 并附上：
  - [ ] 安装成功证据
  - [ ] 基础验证结果
  - [ ] 维护人联系方式

## 6. 发布后动作

- [ ] 在源码仓库打 Tag
- [ ] 更新 changelog（版本号与关键改动）
- [ ] 观察 issue 反馈与安装报错
- [ ] 如需紧急修复，按补丁版本（`x.y.z+1`）发版

## 7. 回滚预案（提前确认）

- [ ] 明确回滚触发条件（例如安装失败率、核心功能不可用）
- [ ] npm 处置策略：`deprecate` 当前问题版本并发布修复版
- [ ] 社区收录 PR 若有错误，提交修正 PR 或撤回条目
- [ ] 记录复盘：原因、影响范围、修复措施、防再发动作

## 8. 当前待办项

- [ ] 当前插件源码仓库公开可访问性需最终确认
- [ ] 向 `openclaw/openclaw` 提交社区插件收录 PR
