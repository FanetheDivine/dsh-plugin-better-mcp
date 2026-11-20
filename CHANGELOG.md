# Changelog

## [Unreleased]

### Added

- stdio MCP 支持工作区级实例，按当前工作目录启动与复用，并提供 active/inactive 生命周期提醒。
- 工作区代理隔离工具、instructions 与 resources，目录切换和缺失时执行清理。
- 面板支持工作区开关、连接分组、折叠、搜索、全部重连与单实例重连。

### Changed

- DSH 宿主依赖统一升级到 `0.2.2-rc.5`。

### Fixed

- 注册 MCP 前复制冻结配置，兼容宿主 Schema 默认值解析。
- 在插件自有的 Agent scope 中注册工作区 resource providers。
