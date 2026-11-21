# Contract: 面向模型的文本

只列出本次变更的文本。`<server>` 为配置名，`<workspace>` 为规范化工作区路径。

## active 提醒

active 成功后并入下一条目录消息，`kind` 为 `active`，`state` 为 `active`：

```text
Workspace MCP '<server>' at '<workspace>' is active.
Its process uses this workspace as its cwd and occupies the folder while it runs.
It closes when this Agent sets it inactive or the current turn ends, unless other Agents still have it active in this workspace; those Agents keep the folder occupied.
Closing can take several seconds or fail to confirm.
Before deleting the folder, set it inactive and confirm the result reports the instance as closed.
```

首行由现有提醒渲染生成，其余为 `detail`。

## inactive 工具结果

工作区级服务器 inactive 后，在现有首句后追加一行实例结果：

```text
<server> is now inactive. Do not call mcp__<server>__ tools.
Workspace instance at '<workspace>': <state>. <cleanup detail>
```

| state | cleanup detail |
| --- | --- |
| `closed` | 现有 `closed` 清理说明 |
| `retained` | 现有 inactive 共享占用说明 |
| `failed` | 现有失败说明，明确不得删除 |
| `cleanup-unknown` | 现有未确认说明，明确不得删除 |

结果为 `idle` 时不追加第二行。共享服务器的 inactive 结果不变。

## 不再产生的文本

- inactive 与 Turn 结束的 `inactive` 提醒。
- 切换工作目录或目录缺失时 `idle` 结果的提醒。
