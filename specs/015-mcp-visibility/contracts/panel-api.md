# Contract: 面板路由

保留的同源路由：

| 路由 | 方法 | 变化 |
| --- | --- | --- |
| `/api/better-mcp/status` | GET | 返回 `{ servers }`，不含 `expose` |
| `/api/better-mcp/lazy` | POST | `{ server, lazy }` 写回配置的 `lazy` |
| `/api/better-mcp/restart` | POST | 仅本插件服务器；卸载后重新挂载 |
| `/api/better-mcp/servers` | POST | 定义须含 `description` |
| `/api/better-mcp/servers/remove` | POST | 不变 |
| `/api/better-mcp/oauth/start` | GET | 不变 |
| `/api/better-mcp/oauth/signout` | POST | 不变 |
| `/api/better-mcp/oauth/client` | POST | 不变 |

删除：`/api/better-mcp/endpoint/rotate`、聚合端点前缀路由。

## ServerRow

| 字段 | 说明 |
| --- | --- |
| `name`、`managed`、`transport`、`url`、`auth`、`lazy`、`authorized` | 同前 |
| `description` | 本插件服务器的简介 |
| `state` | `idle`、`connecting`、`connected`、`reconnecting`、`waiting-credentials`、`failed`、`disabled`、`closed` |
| `toolCount` | 已连接时的工具数 |
| `connectedAt` | 已连接时的时间戳 |
| `attempt`、`maxAttempts` | 连接或重连次数 |
| `error` | 宿主返回的原始错误文本 |
| `cleanup` | `failed` 或 `unconfirmed`，清理异常时 |
| `definition` | 去掉客户端密钥的定义 |
