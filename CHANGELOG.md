# Changelog

## Unreleased

### Added

- 待授权 MCP 触发侧栏 SVG 图标阴影呼吸，支持减少动态效果偏好
- OAuth 动态注册支持 `DSH` 与 `Codex` 身份，默认 `Codex`
- OAuth 成功回调页自动请求浏览器关闭当前标签页

### Changed

- 授权入口使用高亮原生链接，由 DSH 默认外链行为打开默认浏览器并跟随授权重定向
- 会话目录仅列出无需 OAuth 或已授权的服务器，授权成功立即向在线会话发送更新

### Fixed

- Figma 官方 MCP 使用 `Codex` 动态注册与系统分配端口的 `/callback`，避免把 OpenAI 登录固定标识发送到 Figma
