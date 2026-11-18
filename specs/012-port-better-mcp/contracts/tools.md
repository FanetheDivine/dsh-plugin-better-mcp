# Contract: Model tools

两个工具都由 `defineTool` 注册，输出 schema 为 `{ type: 'json' }`。

## mcp_servers

- **description**: `List this profile's MCP servers with connection state, tool counts, lazy and authorization flags. Use it before mcp_call when a server may be lazy or need sign-in.`
- **parameters**: 无。
- **execute**: 返回面板快照（不含聚合令牌）。
- **render**: 每台服务器一行：

```text
<name> — <state> (<detail>) [<managed|external>, <lazy|resident>, <authorized|needs-auth>]
```

  - `connected` 时 detail 为 `<toolCount> tool(s)`，否则用状态说明。
  - `auth=oauth` 时追加授权标记，其他服务器不追加。
  - 没有服务器时输出 `(no MCP servers)`。
  - 空行后输出 `Aggregate endpoint:`，每组一行 `  <url> — <title>`。

## mcp_call

- **description**: `Call one tool on an MCP server by name, mounting a lazy server on first use. Prefer the server's native mcp__<server>__<tool> tool when it is already connected; use this when the server is lazy, or to reach a server that is not currently mounted.`
- **parameters**:

| 名称 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `server` | string | 是 | MCP 服务器名 |
| `tool` | string | 是 | 服务器上的原始工具名，不含 `mcp__<server>__` 前缀 |
| `arguments` | object（开放） | 否 | 工具参数，缺省 `{}` |

- **execute**:

1. 去掉 `server` 与 `tool` 首尾空白；为空分别抛 `server must not be empty` 与 `tool must not be empty`。
2. 服务器不在本插件配置中时抛错，列出已配置与已管理的服务器名。
3. 挂载（已挂载则跳过），等待连接，超时 25 秒。
4. 解析公开工具名；不存在时抛错并列出该服务器的可用工具。
5. 通过 `ctx.tools.execute` 执行，透传 `exec.signal`。
6. 返回 `{ server, tool, isError, content }`。

- **render**: `<server>.<tool>: ok|error`，换行后拼接内容中的文本块。

## 错误语义

- 连接失败、等待凭据、`401`、超时都抛错，让模型看到可读原因。
- 工具自身报错不抛错，返回 `isError: true`，保留原始内容。
- 模型参数校验由 `defineTool` 在调用前完成。