# Data Model: Better MCP 插件

**Date**: 2026-11-18 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## 1. PluginConfig

插件行 `config` 的解析结果，`apply` 通过热重载引用读取。

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `servers` | `Record<ServerName, ServerDefinition>` | `{}` | 本插件管理的 MCP 服务器 |
| `expose` | `ExposeConfig` | 见下 | 聚合端点 |

`servers` 与 `expose` 都是 volatile：写入后就地生效，不重挂插件。

## 2. ServerDefinition

| 字段 | 类型 | 必填 | 校验 |
| --- | --- | --- | --- |
| `transport` | `'stdio' \| 'streamable-http'` | 是 | 枚举 |
| `command` | `string` | stdio 必填 | stdio 下非空；http 下必须为空 |
| `args` | `string[]` | 否 | 仅 stdio |
| `env` | `Record<string,string>` | 否 | 仅 stdio；值可含凭据模板 |
| `cwd` | `string` | 否 | 仅 stdio |
| `url` | `string` | http 必填 | 仅 http；绝对 URL |
| `headers` | `Record<string,string>` | 否 | 仅 http |
| `auth` | `'oauth' \| 'none'` | 否 | 默认 `oauth` |
| `lazy` | `boolean` | 否 | 默认 `true` |
| `oauth` | `OAuthClientConfig` | 否 | 仅 http + oauth |
| `toolCallTimeoutMs` | `number` | 否 | 正整数，转发给管理器 |
| `startupTimeoutMs` | `number` | 否 | 正整数，转发给管理器 |
| `closeTimeoutMs` | `number` | 否 | 正整数，转发给管理器 |
| `reconnect` | `object` | 否 | 原样转发给管理器 |

`ServerName` 规则：`^[A-Za-z0-9_-]{1,32}$`，与 `@deepseek-ai/dsh-mcp-client` 的 `SERVER_NAME_PATTERN` 一致。

挂载时从定义中剔除 `lazy`、`auth`、`oauth`，其余字段交给 `ctx.mcpManager.register(name, entry)`。

## 3. OAuthClientConfig

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `scopes` | `string[]` | 空数组时用服务器元数据的 `scopes_supported` |
| `clientId` | `string` | 固定客户端标识；缺省时动态注册 |
| `redirectUri` | `string` | 固定回调地址；必须是 `127.0.0.1` 或 `localhost` |
| `authorizationServer` | `string` | 覆盖发现结果 |
| `tokenEndpoint` | `string` | 覆盖令牌端点 |
| `clientSecret` | `string` | 兼容旧配置读取；界面写入凭据库，不再写入此字段 |

## 4. ExposeConfig

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | 关闭时端点返回 404 |
| `endpoint` | `string` | `/better-mcp/mcp` | 去掉末尾 `/`；必须是以 `/` 开头的路径 |
| `groups` | `Record<GroupName, ToolGroup>` | `harness` | 至少一个组 |

`ToolGroup`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | `string` | 面板显示名，缺省用组名 |
| `include` | `string[]` | `*` 通配符；为空时排除所有 `mcp__` 前缀工具 |
| `exclude` | `string[]` | 优先于 include |

默认组：`harness`，标题 `DSH harness tools`，包含 `workspace_*` 与 `session_*`。

## 5. LazyState

`<dsh home>/plugin-data/better-mcp/state.json`：

```json
{ "lazy": { "figma": true, "chrome": false } }
```

- 文件缺失或损坏时按空状态处理。
- 一个服务器是否懒加载：状态文件里的布尔值优先，否则用配置的 `lazy`（缺省 `true`）。
- 写入按“临时文件 + rename”原子替换。

## 6. OAuthGrant

凭据库记录：`credentialKey('better-mcp', grantId(serverName))`，`kind: 'grant'`，payload：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `accessToken` | `string` | 必需，缺失时视为未授权 |
| `refreshToken` | `string?` | 刷新用 |
| `expiresAt` | `number?` | 毫秒时间戳；距过期 30 秒内触发刷新 |
| `tokenType` | `string` | 默认 `Bearer` |
| `clientId` | `string` | 发起授权的客户端 |
| `clientSecret` | `string?` | 授权时使用的密钥（若有） |
| `tokenEndpoint` | `string` | 刷新端点 |
| `resource` | `string?` | RFC 8707 资源标识 |
| `authorization` | `object` | 授权服务器元数据 |
| `authorizedAt` | `number` | 授权完成时间 |

`grantId(name)`：小写、非字母数字折叠为 `-`、去首尾、截断 32 字符，再加服务器名 SHA-256 前 8 位，保证合法且唯一。

## 7. ClientSecretRecord

凭据库记录：`credentialKey('better-mcp', `${grantId(serverName)}-client`)`，`kind: 'api-key'`，`key` 为客户端密钥。删除服务器时一并删除。

## 8. EndpointToken

凭据引用 `credentialRef('BETTER_MCP_TOKEN')`，值为 24 字节随机数的 base64url。首次读取时创建；轮换时覆盖。

## 9. ManagedServerView

来自 `ctx.mcpManager.list()`：

| 字段 | 说明 |
| --- | --- |
| `name` | 服务器名 |
| `configured` | 条目是否仍存在 |
| `status` | `connected`、`connecting`、`reconnecting`、`waiting-credentials`、`failed`、`disabled`、`closed` |

面板把状态压缩为 `state` + `detail` + `toolCount`。

## 10. PanelSnapshot

`GET /api/better-mcp/status` 的返回：

```json
{
  "servers": [
    {
      "name": "figma",
      "managed": true,
      "transport": "streamable-http",
      "url": "https://mcp.figma.com/mcp",
      "auth": "oauth",
      "lazy": true,
      "authorized": false,
      "mounted": false,
      "state": "idle",
      "detail": "...",
      "toolCount": 0
    }
  ],
  "expose": {
    "enabled": true,
    "endpoint": "/better-mcp/mcp",
    "groups": [
      { "name": "harness", "title": "DSH harness tools", "url": "/better-mcp/mcp/harness", "include": ["workspace_*"], "exclude": [] }
    ],
    "token": "<plain token>"
  }
}
```

服务器行来自“配置里的服务器 ∪ 管理器里的服务器”，按名称排序。`managed` 表示本插件配置的。

## 11. PendingAuthorization（内存）

| 字段 | 说明 |
| --- | --- |
| `state` | 授权 state |
| `serverName` | 目标服务器 |
| `verifier` | PKCE verifier |
| `redirectUri` | 回调地址 |
| `clientId` / `clientSecret` | 客户端 |
| `resource` | 资源标识 |
| `authorization` | 授权服务器元数据 |
| `createdAt` | 创建时间 |
| `listener` | 固定回环监听器 |

TTL 10 分钟；插件卸载时关闭监听并清空。

## 状态流转

| 起点 | 事件 | 结果 |
| --- | --- | --- |
| 未挂载 | 配置新增且 `lazy=false` | 对账后挂载 |
| 未挂载 | `mcp_call` 命中 | 挂载 → 等待连接 → 执行 |
| 已挂载 | 关闭懒加载 | 卸载，状态文件记 `lazy=true` |
| 懒加载 | 打开懒加载 | 挂载，状态文件记 `lazy=false` |
| 已挂载 | 定义变更 | 卸载旧定义 → 按新定义挂载（非常驻时） |
| 已挂载 | 授权完成 | 卸载 → 写入授权 → 非常驻时重新挂载 |
| 已挂载 | 删除定义 | 卸载 → 删除授权与客户端密钥 → 清状态项 |
| 任意 | 插件卸载 | 关闭回环监听、清 pending、释放全部挂载 |

## 校验清单

- 服务器名匹配 `^[A-Za-z0-9_-]{1,32}$`；重名拒绝。
- stdio：`command` 非空，`url` 为空，`headers` 为空。
- http：`url` 非空，`command` 为空，`args` 为空，`env` 为空，`cwd` 为空。
- `lazy` 与 `auth` 类型正确；`auth=oauth` 仅用于 http。
- 组名非空；`include`/`exclude` 元素为非空字符串。
- `endpoint` 以 `/` 开头，去末尾 `/` 后非空。
- 配置结果冻结；写入的 JSON 值可无损往返。