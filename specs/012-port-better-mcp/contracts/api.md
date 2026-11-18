# Contract: Panel HTTP routes

所有 `/api/better-mcp/*` 路由通过 `ctx.connection.fetch.register` 注册，使用同源 Cookie 鉴权；请求体为 JSON，响应为 JSON。错误响应统一为 `{ "error": "<可读原因>" }`。

## GET /api/better-mcp/status

返回面板快照，见 [data-model.md](../data-model.md#10-panelsnapshot)。

- `200`：快照。
- 首次读取时若凭据库没有聚合令牌，自动创建并返回。

## POST /api/better-mcp/lazy

请求：

```json
{ "server": "figma", "lazy": true }
```

- `200`：切换后重新读取的快照。
- `400`：服务器不在本插件配置中。
- `409`：关闭懒加载时挂载失败；`error` 为管理器给出的原因。
- 关闭懒加载成功时立即挂载；打开时立即卸载。状态写入 `state.json`。

## POST /api/better-mcp/restart

请求：`{ "server": "figma" }`

- `200`：重连后的快照。
- `400`：服务器不在本插件配置中。
- `409`：重新挂载失败。
- 懒加载服务器只卸载，不重新挂载。

## POST /api/better-mcp/servers

新增或更新一台服务器，定义写回 profile 的用户层配置。

请求：

```json
{ "server": "figma", "definition": { "transport": "streamable-http", "url": "https://mcp.figma.com/mcp", "lazy": true, "auth": "oauth", "oauth": { "scopes": ["mcp:connect"] } } }
```

- `200`：写入后的快照。
- `400`：名称非法、重名（新增时）、定义字段缺失或与传输方式冲突、路径不可写。
- `409`：配置写入被更高层覆盖或部署只读。
- 成功写入后，volatile 更新触发的对账完成才返回。

## POST /api/better-mcp/servers/remove

请求：`{ "server": "figma" }`

- `200`：删除后的快照。
- `400`：服务器不在本插件配置中。
- `409`：配置写入被拒绝。
- 删除同时完成：卸载、删除授权记录、删除客户端密钥记录、清除懒加载状态项。

## GET /api/better-mcp/oauth/start?server=<name>

启动 OAuth。

- `200`：

```json
{ "url": "https://…/authorize?…", "scopes": ["mcp:connect"], "redirectUri": "http://127.0.0.1:19876/callback" }
```

- `400`：未知服务器，或服务器不是 `streamable-http`。
- `502`：发现失败、动态注册失败、固定回环端口无法监听；`error` 说明阶段。

流程行为见 [mcp-endpoint.md](./mcp-endpoint.md#oauth-回调) 与 [data-model.md](../data-model.md#11-pendingauthorization内存)。

## POST /api/better-mcp/oauth/signout

请求：`{ "server": "figma" }`

- `200`：删除授权记录并卸载后的快照。
- `400`：缺少 `server`。

## POST /api/better-mcp/oauth/client

配置固定 OAuth 客户端。

请求：

```json
{ "server": "figma", "clientId": "…", "clientSecret": "…", "redirectUri": "http://127.0.0.1:19876/callback" }
```

- `200`：配置写入后的快照。
- `400`：未知服务器、回调地址不是回环地址、字段类型错误。
- `409`：配置写入被拒绝。
- `clientId` 与 `redirectUri` 写入配置；`clientSecret` 写入凭据库。`clientSecret` 为空字符串时删除记录。

## POST /api/better-mcp/endpoint/rotate

- `200`：`{ "token": "<新令牌>" }`。旧令牌立即失效。

## 通用约束

- 所有写路由在读快照前等待对账完成，避免返回旧状态。
- 未知服务器名一律 `400`，不以 404 区分，避免探测。
- 响应头 `cache-control: no-store`。
- 路由注册在插件 effect 中，卸载时全部释放。