# Changelog

## Unreleased

### Added

- 按会话控制 MCP 工具可见性；`mcp_manage({ server, command })` 切换本会话中一台服务器的可见性
- 会话提醒：首步、压缩后与可见性变化时写入服务器名称、简介与 `mcp__<server>__` 用法
- 服务器定义的必填 `description`，写入面板、会话提醒与配置校验
- 面板驱动的 OAuth 登录、固定回环回调与凭据库存储
- 侧栏 MCP 面板与插件页配置页，共用同一套增删改与授权流程
- 元数据测试覆盖 `locale/*.json` 的结构、键集、禁用字符与清单声明
- `docs/i18n.md` 国际化规范，宪章新增原则 VIII，版本 2.1.0

### Changed

- 服务器在插件启用时全部挂载；`lazy` 只决定新会话默认可见性
- 面板状态按字典格式化，其他来源的服务器只显示状态
- 插件描述改为「可视化地对MCP进行管理和鉴权；提供MCP懒加载能力」
- 宪章精简为五条原则，版本 3.0.0；宿主机制与国际化规则迁入归属文档
- 主工作区固定为干净的 `main`，Spec Kit 流程最前与最后由 Agent 同步 `origin/main`
- 测试入口拆成 `test:code` 与 `test:dist`；`build` 末尾运行产物测试，产物过期时提示 `pnpm build`

### Removed

- 聚合 MCP 端点、分组规则、端点令牌与 `expose` 配置
- `mcp_call` 与 `mcp_servers` 工具
- 懒加载状态文件 `state.json`

## [0.1.0] - 2026-11-18

### Added

- 按服务器懒加载 MCP，`mcp_call` 首次命中时挂载并等待连接。
- 可视化 OAuth：发现、动态注册、PKCE、固定回环回调、刷新与退出。
- 侧栏 MCP 面板与插件页配置页，共用同一套状态、授权与服务器增删改。
- 无状态聚合 MCP 端点，按组暴露本机工具，Bearer 令牌鉴权与轮换。
- `mcp_servers` 与 `mcp_call` 工具。
- 授权、客户端密钥与聚合令牌存 DSH 凭据库。
