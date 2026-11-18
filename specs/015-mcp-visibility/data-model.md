# Data Model: 按会话管理 MCP 可见性

## ServerDefinition

本插件配置的一台服务器，存放在插件行配置 `servers.<name>`。

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `description` | string | 必填，去掉首尾空白后非空 |
| `transport` | `stdio` \| `streamable-http` | 必填 |
| `url`、`headers` | — | 仅 http |
| `command`、`args`、`env`、`cwd` | — | 仅 stdio |
| `auth` | `oauth` \| `none` | http 默认 `oauth`，stdio 只能 `none` |
| `lazy` | boolean | 默认 `true`，即各会话默认不可见 |
| `oauth` | object | 可选 |
| 其他管理器字段 | — | 原样透传给 `mcpManager.register` |

名称匹配 `^[A-Za-z0-9_-]{1,32}$`。顶层配置只接受 `servers`。

## SessionVisibility

一个会话对服务器的显式选择。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `overrides` | `Record<server, boolean>` | `true` 为 active，`false` 为 inactive |

有效可见性：`overrides[server] ?? !definition.lazy`。

来源优先级：

1. 内存待定表：本进程内 `mcp_manage` 写入、尚未落入日志的选择。
2. projection：最近一条目录消息记录的 `overrides`。
3. 服务器定义的 `lazy`。

已删除服务器的选择在计算时忽略，在下一条目录消息中不再记录。

## CatalogMessage

写入会话的 user 角色消息，`source` 结构：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `kind` | `'better-mcp-catalog'` | 消息来源 |
| `form` | `'catalog'` | 宿主上下文形态 |
| `update` | `true` \| 省略 | 更新消息为 `true` |
| `entries` | `{ name, description, active }[]` | 按名称排序的完整目录 |
| `overrides` | `Record<string, boolean>` | 写入时的显式选择 |

目录摘要：`entries` 的规范 JSON 的 sha256。

## CatalogProjection

宿主私有的 session projection，键 `better-mcp-catalog`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `seq` | number \| null | 最近一条目录消息的 seq |
| `digest` | string \| null | 该消息的目录摘要 |
| `entries` | 同上 | 该消息的目录 |
| `overrides` | `Record<string, boolean>` | 该消息的显式选择 |

`apply` 只处理 `user/message` 且 `source.kind === 'better-mcp-catalog'` 的事件，其他事件返回原 state。

## 状态转移

```text
会话创建/恢复 ──► 读取 projection ──► 计算有效可见性 ──► 更新 restrict
mcp_manage ──► 写待定表 ──► 更新 restrict ──► 下一步 pre-step 写目录消息 ──► projection 折叠，清除待定项
tools/change / 配置对账 ──► 重算所有 Agent 的 restrict
pre-step ──► 摘要未变且消息在 surface ──► 不写
         ──► 消息不在 surface ──► 写完整目录
         ──► 摘要变化 ──► 写更新消息
```
