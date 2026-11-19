# Changelog

## [0.1.3] - 2026-11-19

## Unreleased

### Added

- 侧栏 MCP 图标直接进入本插件 `better-mcp` 行配置页
- OAuth 客户端标识提供 DSH 动态注册与 Codex 公开标识两个备选项，并附 Figma 场景说明
- 待授权使用警告色徽标，连接失败等状态更易识别
- `tests/client.test.ts` 覆盖行导航、备选项与警示徽标

- 每个 Turn 结束后，该会话的全部 MCP 服务器自动变为 inactive，后续 Turn 可重新启用
- `better-mcp-catalog` 投影记录最近 `turn/end` 的 seq，恢复会话后仍保持重置结果
- `tests/visibility.test.ts` 覆盖完成、失败与取消的 Turn 重置、Agent 隔离与恢复
- 配置变化或会话可见性变化生效后，`agent.inject` 立即向受影响会话写入 MCP 目录提醒
- `tests/visibility.test.ts` 覆盖配置广播、会话隔离、去重、连续变化合并与空目录
- `tests/client.test.ts` 覆盖面板轮询、慢请求串行、失败续排与停止清理

### Changed

- 面板只列出本插件配置的服务器，标题为「已配置的 MCP」，新增按钮为「新增 MCP」
- 面板删除手动刷新、服务器行图标与来源标签，状态与配置每秒自动同步
- 新增表单默认并优先使用 stdio；HTTP 固定 OAuth，删除认证选择器与回调地址字段
- 客户端标识备选项向上展开，避免表单弹窗出现整体滚动条
- 面板标题 18px / 600，服务器名称 16px / 600
- 插件图标与侧栏入口统一使用 VS Code Codicons 的 MCP 图形
- `mcp_manage` 与目录提醒说明 active 状态持续到当前 Turn 结束
- MCP 面板打开期间每秒串行刷新连接状态，关闭后停止刷新；快照序号阻止旧响应覆盖新状态
- `agent/pre-step` 过滤本来源目录后按最新配置补充至多一条，配置恢复时移除过期提醒

### Fixed

- 保存服务器后弹窗停留在“连接中”，需关闭重开才能看到最终状态
