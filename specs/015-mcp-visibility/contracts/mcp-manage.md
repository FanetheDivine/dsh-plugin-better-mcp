# Contract: `mcp_manage` 工具

## Schema

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `server` | string | 是 | 本插件配置的服务器名 |
| `command` | `'active'` \| `'inactive'` | 是 | 设为可见或不可见 |

描述：`Show or hide one MCP server's tools in this session. Active servers expose their tools as mcp__<server>__<tool> from the next step; inactive servers' tools are removed. The session's MCP catalog lists the servers.`

## 返回值

```json
{ "server": "figma", "active": true, "state": "connected", "toolCount": 12, "detail": "..." }
```

渲染文本：

- active 且已连接：`figma is now active. Its N tools are available as mcp__figma__<tool> from the next step.`
- active 但未连接：`figma is now active, but it is <state>: <detail>. Its tools appear once it connects.`
- inactive：`figma is now inactive. Do not call mcp__figma__ tools.`

## 错误

| 条件 | 错误文本 |
| --- | --- |
| 无 Agent 会话 | `mcp_manage needs an agent session.` |
| 未配置的服务器 | `No MCP server named 'x'. Available: a, b` |
| 非法 command | `command must be active or inactive.` |
