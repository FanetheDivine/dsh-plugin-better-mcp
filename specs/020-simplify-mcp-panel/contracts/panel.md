# Panel Contract

## 状态快照

`GET /api/better-mcp/status` 的 `servers` 只包含本插件配置项，顺序按名称排列。其他插件或宿主设置中的同名只读项不进入响应。

已有行字段与状态语义保持不变；`managed` 字段因恒为本插件配置而移除。

## 保存表单

`POST /api/better-mcp/servers` 的请求结构不变。

- stdio 定义包含 `transport: stdio`、`auth: none`、`command` 与可选 `args`。
- HTTP 定义包含 `transport: streamable-http`、`auth: oauth`、`url`、可选 `headers` 与 `oauth`。
- `oauth` 可包含 `clientId` 与 `scopes`，不由表单携带 `redirectUri` 或 `clientSecret`。

`POST /api/better-mcp/oauth/client` 继续接收 `clientSecret` 与可选 `clientId`。面板不再发送 `redirectUri`；路由保留该字段以兼容既有调用。

## 授权

空 `clientId` 继续使用动态注册。Codex 备选项只是固定标识来源，授权发现、PKCE、回调与凭据存储流程不变。
