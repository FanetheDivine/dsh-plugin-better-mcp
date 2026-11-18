# Contract: 目录消息

## 完整目录

```text
<system-reminder>
The following MCP servers are configured for this session. Each server's tools are named mcp__<server>__<tool>; only active servers' tools are in your tool list.

<mcp_servers>
- `figma` (active): Read Figma design files.
- `chrome` (inactive): Control a Chrome browser.
</mcp_servers>

Call `mcp_manage` with `{ "server": "<name>", "command": "active" }` before you need an inactive server's tools, and with `"inactive"` when you no longer need them. This list replaces earlier MCP server lists in this session.
</system-reminder>
```

## 更新消息

```text
<system-reminder>
MCP server visibility changed in this session.
Now active: `figma`. Call its tools directly with the mcp__figma__ prefix.
Now inactive: `chrome`. Do not call mcp__chrome__ tools.

<mcp_servers>
...完整目录，格式同上...
</mcp_servers>

Call `mcp_manage` to change visibility. This list replaces earlier MCP server lists in this session.
</system-reminder>
```

- 只有目录内容变化而可见性不变时，首行改为 `The MCP server list changed.`，省略 Now active/Now inactive 行。
- 目录为空时，`<mcp_servers>` 内写 `(none)`，并说明 `No MCP servers are available. Do not call mcp__ tools from earlier lists.`
- 简介中的 `<`、`>`、`&` 转义为实体。

## source

见 [data-model.md](../data-model.md#catalogmessage)。
