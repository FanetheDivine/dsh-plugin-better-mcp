# Changelog

## Unreleased

### Added

- 待授权 MCP 触发侧栏 SVG 图标颜色与投影呼吸，支持减少动态效果偏好
- OAuth 动态注册支持 `DSH` 与 `Codex` 身份，默认 `Codex`；帮助圆圈始终显示，选择 DSH 或点击圆圈展开提示，点击外部或 Escape 关闭
- OAuth 成功回调页自动请求浏览器关闭当前标签页

### Changed

- 授权入口使用高亮原生链接，由 DSH 默认外链行为打开默认浏览器并跟随授权重定向
- 会话目录仅列出无需 OAuth 或已授权的服务器，授权成功立即向在线会话发送更新
- 服务器行使用「连接中 / 待授权 / 连接失败 / 已连接」统一标签，懒加载开关紧随标签
- README 改为插件简介与面板截图
- YAML 配置参考移到 `docs/configuration.md`
- Spec Kit 流程采用探索后的分批访谈，并要求完整规格与计划批准后进入下游阶段

### Fixed

- Figma 官方 MCP 使用 `Codex` 动态注册与系统分配端口的 `/callback`，避免把 OpenAI 登录固定标识发送到 Figma