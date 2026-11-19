# Changelog

## Unreleased

### Added

- 每个 Turn 结束后，该会话的全部 MCP 服务器自动变为 inactive，后续 Turn 可重新启用
- `better-mcp-catalog` 投影记录最近 `turn/end` 的 seq，恢复会话后仍保持重置结果
- `tests/visibility.test.ts` 覆盖完成、失败与取消的 Turn 重置、Agent 隔离与恢复
- 配置变化或会话可见性变化生效后，`agent.inject` 立即向受影响会话写入 MCP 目录提醒
- `tests/visibility.test.ts` 覆盖配置广播、会话隔离、去重、连续变化合并与空目录
- `tests/client.test.ts` 覆盖面板轮询、慢请求串行、失败续排与停止清理

### Changed

- `mcp_manage` 与目录提醒说明 active 状态持续到当前 Turn 结束
- MCP 面板打开期间每秒串行刷新连接状态，关闭后停止刷新；快照序号阻止旧响应覆盖新状态
- `agent/pre-step` 过滤本来源目录后按最新配置补充至多一条，配置恢复时移除过期提醒

### Fixed

- 保存服务器后弹窗停留在“连接中”，需关闭重开才能看到最终状态