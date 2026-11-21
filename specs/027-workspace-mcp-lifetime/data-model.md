# Data Model: 工作区级 MCP 释放

## Active Reference

| 字段 | 说明 |
| --- | --- |
| Agent | 持有引用的 Agent |
| 实例键 | 服务器配置名 + 规范化工作区路径 |

状态转换：

| 事件 | 变化 |
| --- | --- |
| active 成功 | 加入实例的 `activeAgents` |
| active 失败或取消 | 移除，按释放规则处理实例 |
| inactive | 移除，按释放规则处理实例 |
| Turn 结束 | 移除该 Agent 的全部引用，逐个按释放规则处理实例 |
| 切换工作目录 | 移除旧工作区的引用与绑定，沿用现有关闭屏障 |

释放规则：

- 实例的 `activeAgents` 仍非空：保留，结果为 `retained`。
- 实例的 `activeAgents` 为空：关闭，结果为 `closed`、`failed` 或 `cleanup-unknown`。
- 该 Agent 没有引用：不产生结果。

## Cleanup Result

沿用 `WorkspaceCleanupResult`：`serverName`、`workspace`、`state`、`error`。

| state | 工具结果 | 切换或缺失提醒 |
| --- | --- | --- |
| `idle` | 不出现 | 不注入 |
| `retained` | 说明其他 Agent 仍 active | 注入 |
| `closed` | 说明已关闭 | 注入 |
| `failed` / `cleanup-unknown` | 说明未确认，不得删除 | 注入 |
