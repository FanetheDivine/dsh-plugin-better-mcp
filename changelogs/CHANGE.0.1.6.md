# Changelog

## [0.1.6] - 2026-11-20

## [Unreleased]

### Added

- stdio MCP 支持工作区级实例，按当前工作目录启动与复用，并提供 active/inactive 生命周期提醒。
- 工作区代理隔离工具、instructions 与 resources，目录切换和缺失时执行清理。
- 面板支持工作区开关、连接分组、折叠、搜索、全部重连与单实例重连。

### Changed

- DSH 宿主依赖统一升级到 `0.2.2-rc.5`。
- 实机测试改为链接安装并启用 HMR：构建后同一 GUI 实例自动替换插件，前后端都无需刷新或重启，每轮结束删除 profile。
- `docs/development.md` 增加前端 UI 链接规则：`a` 标签的 `href` 使用完整 URL，相对链接在 Desktop 中打不开目标。

### Fixed

- 注册 MCP 前复制冻结配置，兼容宿主 Schema 默认值解析。
- 在插件自有的 Agent scope 中注册工作区 resource providers。
- 工作区 active 等待实例连接成功，失败或取消时释放 active 引用。
