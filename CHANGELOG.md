# Changelog

## Unreleased

### Added

- 配置变化或会话可见性变化生效后，`agent.inject` 立即向受影响会话写入 MCP 目录提醒
- `tests/visibility.test.ts` 覆盖配置广播、会话隔离、去重、连续变化合并与空目录
- `tests/client.test.ts` 覆盖面板轮询、慢请求串行、失败续排与停止清理

### Changed

- MCP 面板打开期间每秒串行刷新连接状态，关闭后停止刷新；快照序号阻止旧响应覆盖新状态
- `agent/pre-step` 过滤本来源目录后按最新配置补充至多一条，配置恢复时移除过期提醒

### Fixed

- 保存服务器后弹窗停留在“连接中”，需关闭重开才能看到最终状态