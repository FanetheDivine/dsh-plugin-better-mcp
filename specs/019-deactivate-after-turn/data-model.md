# Data Model: Turn 结束后自动停用 MCP

## CatalogState

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `seq` | `number \| null` | 最近目录消息的事件 seq |
| `entries` | `CatalogEntry[]` | 最近目录消息记录的服务器可见性 |
| `overrides` | `Record<string, boolean>` | 最近目录消息记录的显式选择 |
| `turnEndSeq` | `number \| null` | 最近 `turn/end` 的事件 seq |

- `turnEndSeq` 晚于 `seq` 时，当前配置中的全部服务器按 inactive 计算。
- 新目录消息的 `seq` 晚于 `turnEndSeq` 后，以消息中的 `overrides` 为准。
- 投影 `stateVersion` 升为 2，旧检查点由宿主重放。

## Agent 运行时状态

| 状态 | 所有者 | Turn 结束处理 |
| --- | --- | --- |
| 待定显式选择 | Agent | 清除 |
| 工具限制 | Agent | 按全部 inactive 重算 |
| 待处理目录提醒 | Agent | 保持不变 |

## 状态转换

1. `mcp_manage` 在当前 Turn 设置显式选择并同步工具限制。
2. `turn/end` 提交后，该 Agent 的全部服务器变为 inactive。
3. 下一模型步骤写入目录更新，持久化全 inactive 的显式选择。
4. 没有目录变化时跳过提醒，Turn 边界仍决定 inactive 状态。

## 隔离规则

- 每个 Agent 只读取自己的会话投影。
- `turn/end` 只影响同一会话 id 的在线 Agent。
- 服务器连接与 `lazy` 配置不参与状态转换。
