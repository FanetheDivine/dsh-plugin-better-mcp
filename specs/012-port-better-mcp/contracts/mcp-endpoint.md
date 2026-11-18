# Contract: Aggregate MCP endpoint

端点路径来自 `expose.endpoint`（默认 `/better-mcp/mcp`），组路径为 `<endpoint>/<group>`。无组名时使用第一个组。

## 传输

- 无状态 Streamable HTTP：只接受 `POST`，回包为普通 JSON。
- `OPTIONS` 返回 `204`，带 CORS 头。
- 其他方法返回 `405` 与 JSON-RPC 错误 `-32000`。
- 响应头：`content-type: application/json; charset=utf-8`、`cache-control: no-store`、`access-control-allow-origin: *`、`access-control-allow-methods: POST, GET, OPTIONS`、`access-control-allow-headers: content-type, authorization, mcp-protocol-version, mcp-session-id`。

## 鉴权

- 从 `Authorization: Bearer <token>` 读取；也接受 `?token=` 查询参数。
- 凭据库没有令牌时返回 `500` 与 `-32603`。
- 令牌不匹配时返回 `401`、`www-authenticate: Bearer realm="dsh-better-mcp"` 与 JSON-RPC 错误 `-32001`。
- 端点关闭时返回 `404`；未知组返回 `404` 并列出已知组。

## JSON-RPC 方法

| 方法 | 行为 |
| --- | --- |
| `initialize` | 回显客户端协议版本，缺省 `2025-06-18`；`capabilities.tools.listChanged = true`；`serverInfo` 为 `{ name: 'dsh-<group>', title: 'DSH <group> tools', version: '0.1.0' }` |
| `notifications/initialized` | 不回包 |
| `notifications/cancelled` | 不回包 |
| `ping` | 回 `{}`；通知形态不回包 |
| `tools/list` | 返回组内工具，`inputSchema` 用工具参数声明 |
| `tools/call` | 执行组内工具；不在组内返回 `-32602`；执行超时 120 秒 |

- 通知（无 `id`）一律不回包；全部是通知时返回 `202` 空响应。
- 批量请求最多处理 20 条；回包顺序与请求一致。
- 无效消息返回 `-32600`；JSON 解析失败返回 `-32700`；未知方法返回 `-32601`；内部异常返回 `-32603`。

## 工具内容映射

- 文本块原样映射为 `{ type: 'text', text }`。
- 非文本块映射为 `{ type: 'text', text: '[<type> content omitted]' }`。
- 没有内容时返回 `{ type: 'text', text: '(no output)' }`。
- 执行抛错时返回 `isError: true` 与 `Error: <原因>` 文本。

## 组选择

- `include` 为空：匹配除 `mcp__` 前缀以外的全部工具。
- `include` 非空：至少匹配一条。
- `exclude` 命中即排除，优先于 `include`。
- 通配符只有 `*`，其余正则元字符按字面匹配。

## OAuth 回调

`GET /better-mcp/oauth/callback` 走 `ctx.webServer` 的 exact 路由，返回 HTML 结果页。

- 成功：`200`，标题 `Authorization complete`。
- 失败：`400`，标题 `Authorization failed`，正文为原因。
- `error` 查询参数直接作为失败原因。
- 未知或超过 10 分钟的 `state` 返回失败，提示从面板重新发起。
- 服务器钉死回调地址时，插件在 `127.0.0.1` 或 `localhost` 的指定端口临时监听，收到一次回调后关闭；10 分钟无回调自动关闭。
- 回调成功后：写授权记录、卸载旧实例、按懒加载设置重新挂载。