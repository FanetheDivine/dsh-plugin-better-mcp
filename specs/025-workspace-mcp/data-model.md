# Data Model: Workspace 级 MCP 实例

## ServerDefinition

新增字段：

| 字段 | 类型 | 默认值 | 校验 |
| --- | --- | --- | --- |
| `workspace` | `boolean` | `false` | 仅 `transport: stdio` 可为 `true` |

规则：

- 既有定义省略该字段时保持共享实例行为。
- `workspace: true` 时强制 `lazy: true`，表单隐藏“懒加载”开关。
- 工作区级定义在交给宿主 MCP Manager 前移除 `workspace` 等插件字段。
- 工作区级实例的 `cwd` 始终为所属工作区，覆盖定义中的 `cwd`。
- `description` 变化保留实例；连接字段或 `workspace` 变化重建对应实例。

## Workspace

| 属性 | 含义 |
| --- | --- |
| `key` | 宿主当前有效工作目录的规范化绝对路径 |
| `path` | 传给 stdio `cwd` 的同一路径 |

同一 `key` 只标识一个工作区。Agent 切换目录后绑定新的 `key`。

## WorkspaceInstance

键为 `(serverName, workspaceKey)`。

| 属性 | 含义 |
| --- | --- |
| `serverName` | 用户配置名 |
| `workspaceKey` | 所属工作区键 |
| `internalName` | 全局 MCP Manager 中的唯一名称 |
| `entry` | 已设置工作区 `cwd` 的 stdio 注册项 |
| `dispose` | Manager 注册释放函数 |
| `boundAgents` | 当前位于该工作区的 Agent 集合 |
| `activeAgents` | 当前显式或默认 active 的 Agent 集合 |
| `generation` | 配置与连接换代标识 |
| `closeTask` | 正在等待 Manager 清理的共享 Promise |
| `status` | 从 Manager 按 `internalName` 读取的状态视图 |

状态沿用宿主，并增加插件侧 `closing` 与 `cleanup-unknown` 视图。

## 生命周期

### active

1. 将 Agent 加入 `boundAgents` 与 `activeAgents`。
2. 工作区不存在时返回错误并准备提醒，不启动实例。
3. 已存在实例时复用。
4. 不存在实例时按实例键串行创建，完成后再次检查，避免并发重复注册。
5. 等待当前 generation 的 Manager 状态变为 `connected`，随后才开放代理并返回成功。
6. 最终失败、取消或 generation 失效时释放当前 Agent 的 active 引用并恢复 inactive。
7. 写入 active 删除警告。

### inactive

1. 从该服务器的 `activeAgents` 移除当前 Agent，并立即释放其代理与资源可见性。
2. 仍有其他 active Agent 时保留实例，写入共享占用提醒。
3. 没有 active Agent 时调用 disposer 并等待关闭，写入关闭结果提醒。
4. Turn 结束导致的自动 inactive 使用相同规则。

### Agent 释放

1. 移除 Agent 的绑定和 active 引用。
2. 保留已连接实例及其状态。
3. 后续 Agent active 时复用实例。

### 目录切换

1. `working-directory/access` 的 `next()` 提交新目录。
2. Agent 绑定新目录并离开旧目录的 `boundAgents` 与 `activeAgents`。
3. 旧工作区仍有其他绑定 Agent 时保留实例。
4. 旧工作区无其他绑定 Agent 时关闭其全部工作区实例。
5. 等待全部关闭结果后切换工具才返回。
6. 清理失败不改变新目录，写入错误与“暂不删除”提醒。

### 文件夹缺失

在 Agent 下一步和 active 调用前检查路径。缺失时关闭该工作区实例，使其代理、instructions 与 resources 失效，并写入提醒。

### 宿主退出

释放全部注册、代理、resource provider、watch 与待处理状态。

## AgentBinding

| 属性 | 含义 |
| --- | --- |
| `agent` | 当前 Agent |
| `workspaceKey` | 当前绑定工作区 |
| `proxies` | 公开工具名到 ProxyRecord 的映射 |
| `resourceProviders` | 公开服务器名到 provider disposer 的映射 |
| `restriction` | 内部工具 deny 与共享服务器 lazy 限制的合并结果 |
| `pendingNotices` | 尚未被目录投影确认提交的工作区提醒 |

## WorkspaceNotice

| 属性 | 含义 |
| --- | --- |
| `kind` | `active`、`inactive`、`workspace-cleanup` 或 `workspace-missing` |
| `serverName` | 公开配置名 |
| `workspace` | 相关路径 |
| `state` | `connected`、`retained`、`closed`、`failed` 或 `cleanup-unknown` |
| `detail` | 共享占用、错误或删除前置条件 |
| `id` | 单调换代标识，用于队列去重与投影确认 |

## ProxyRecord

| 属性 | 含义 |
| --- | --- |
| `publicName` | `mcp__<serverName>__<tool>` 形式的 Agent-local 名称 |
| `targetName` | 全局内部工具名 |
| `target` | 捕获的完整 ToolDefinition 身份 |
| `workspaceKey` | 允许执行的工作区 |
| `dispose` | Agent-local 注册释放函数 |

执行前检查 target 身份、当前绑定、active 状态、工作区存在性和配置 generation。直接调用 target 的执行与内容投影回调，不经过第二次工具管线。

## PanelModel

每个服务器配置保留一个主行。工作区级主行包含实例数组：

| 字段 | 含义 |
| --- | --- |
| `workspace` | 是否启用工作区级 |
| `instances` | `WorkspaceInstanceRow[]` |
| `state` | 供 API 与 `mcp_manage` 使用的聚合状态，不渲染“已连接”标签 |

`WorkspaceInstanceRow` 包含 `workspace`、`state`、`toolCount`、时间、重连与错误字段。

面板规则：

- “连接情况”可折叠。
- `connected` 实例进入成功组，其余实例进入失败组并显示实际状态。
- 搜索按工作区名称或路径片段过滤两个分组。
- 主行“全部重连”重建该配置的全部现有实例，不受搜索过滤影响。
- 工作区行“重连”只重建对应实例。

## Configuration Reconciliation

- 共享到工作区：卸载共享实例，移除旧工具；等待后续 active 按需创建。
- 工作区到共享：关闭全部工作区实例，挂载一个共享实例。
- 工作区级连接字段变化：按配置重建现有全部工作区实例。
- 服务器删除：关闭全部实例、绑定代理和状态，再删除配置。
- 简介变化：保留实例，只更新目录。
