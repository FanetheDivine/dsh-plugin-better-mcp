# Changelog

## Unreleased

### Added

- MCP 服务器懒加载、按需挂载与 `mcp_call` 调用
- 面板驱动的 OAuth 登录、固定回环回调与凭据库存储
- 无状态聚合 MCP 端点、分组规则与令牌轮换
- 侧栏 MCP 面板与插件页配置页，共用同一套增删改与授权流程
- 元数据测试覆盖 `locale/*.json` 的结构、键集、禁用字符与清单声明
- `docs/i18n.md` 国际化规范，宪章新增原则 VIII，版本 2.1.0

### Changed

- 测试入口拆成 `test:code` 与 `test:dist`；`build` 末尾运行产物测试，产物过期时提示 `pnpm build`

## [0.1.0] - 2026-11-18

### Added

- 按服务器懒加载 MCP，`mcp_call` 首次命中时挂载并等待连接。
- 可视化 OAuth：发现、动态注册、PKCE、固定回环回调、刷新与退出。
- 侧栏 MCP 面板与插件页配置页，共用同一套状态、授权与服务器增删改。
- 无状态聚合 MCP 端点，按组暴露本机工具，Bearer 令牌鉴权与轮换。
- `mcp_servers` 与 `mcp_call` 工具。
- 授权、客户端密钥与聚合令牌存 DSH 凭据库。
