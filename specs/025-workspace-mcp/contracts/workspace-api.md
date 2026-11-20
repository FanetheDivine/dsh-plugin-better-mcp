# Contracts: Workspace 级 MCP 实例

## 配置契约

### stdio 工作区级服务器

```yaml
servers:
  serena:
    description: 当前项目的 Serena 工具
    transport: stdio
    command: uvx
    args: ['--from', 'git+https://github.com/oraios/serena', 'serena', 'start-mcp-server']
    workspace: true
```

运行实例接收：

```text
cwd = <当前工作区规范化绝对路径>
lazy = true
```

工作区值覆盖定义中的 `cwd`。工作区级表单隐藏“懒加载”开关。

### 校验错误

- `workspace: true` 用于 HTTP：`servers.<name>.workspace requires stdio`。
- `workspace` 非布尔值：`servers.<name>.workspace must be a boolean`。
- 未设置或 `false`：使用现有共享实例与原有 lazy 行为。

## `mcp_manage` 契约

### active

1. 校验当前 Agent、工作区与配置。
2. 将当前 Agent 加入实例 active 引用。
3. 复用或创建当前工作区实例。
4. 同步代理与 resource provider。
5. 写入删除警告 system-reminder。

返回现有 `ManageResult` 字段，`state` 表示当前工作区实例状态。连接异步进行时返回 `connecting`。

### inactive

1. 立即隐藏当前 Agent 的工具与 resources。
2. 移除当前 Agent 的 active 引用。
3. 无其他 active Agent 时等待实例关闭；否则保留共享实例。
4. 写入关闭或共享占用提醒。

返回：

- 已关闭：`state: closed`。
- 仍被共享：`state: connected`，`detail` 说明其他 active Agent 占用。
- 清理失败：`state: failed`，`detail` 包含原因。
- 清理未知：`state: cleanup-unknown`，`detail` 说明不得据此删除目录。

Turn 结束的自动 inactive 复用相同断连逻辑，提醒留到后续模型步骤。

## 目录与文件契约

`working-directory/access` 在 `next()` 后等待旧工作区无其他绑定 Agent 的全部实例关闭。关闭结果不改变已提交的新目录。

- 成功：旧工作区全部插件实例的直接 stdio 子进程已关闭。
- 失败：提醒包含服务器、路径和错误，明确暂不删除。
- 超时：状态为 `cleanup-unknown`，后台继续 watch，不能作为删除许可。
- 删除由宿主或文件工具执行，其他进程占用仍可能产生文件系统错误。

## 面板状态契约

### GET `/api/better-mcp/status`

现有响应字段保持。服务器行新增：

```ts
interface ServerRow {
  workspace: boolean;
  instances?: WorkspaceInstanceRow[];
}

interface WorkspaceInstanceRow extends StatusView {
  workspace: string;
}
```

规则：

- 共享服务器的 `workspace` 为 `false`，保留原有顶层状态。
- 工作区服务器的 `instances` 按工作区路径排序。
- 无实例时返回空数组与顶层 `idle`。
- 实例状态只读取对应内部名称。
- 工作区配置不渲染“已连接”标签；共享服务器保持原标签。

### 连接情况

“连接情况”与成功、失败分组都可折叠：

- 成功组：`state === connected`。
- 失败组：其余状态，显示实际状态与可用错误。
- 搜索框按工作区名称或完整路径片段过滤。
- 搜索只影响展示，不改变重连全部实例的范围。

### POST `/api/better-mcp/restart`

共享服务器请求保持：

```json
{ "server": "chrome" }
```

工作区配置全部重连：

```json
{ "server": "serena", "all": true }
```

单个工作区重连：

```json
{ "server": "serena", "workspace": "<规范化工作区绝对路径>" }
```

规则：

- `all: true` 重建该配置的全部现有实例，不受面板搜索影响。
- 提供 `workspace` 时只重建对应实例。
- 两种参数同时提供时返回 400。
- 工作区没有现有实例时返回 404。
- 未知服务器返回 400，沿用现有错误结构。
- 为兼容旧客户端，工作区配置省略参数时按 `all: true` 处理。

## 模型工具契约

### 公开工具

Agent 只看到当前工作区且 active 的代理工具：

```text
mcp__<serverName>__<tool>
```

共享服务器与现有目录消息格式保持。内部工具对全部 Agent deny，模型目录不显示内部名称。

普通短合法工具名通过替换服务器前缀得到公开名。有损规范化名称保留宿主生成的后缀。

### 执行保护

代理执行前验证：

1. 当前 Agent 存在且仍绑定代理工作区。
2. 当前 Agent 对该服务器仍为 active。
3. 工作区路径仍存在。
4. 捕获的 target 仍是根注册表中的当前定义。
5. 目标配置与 generation 仍有效。

验证失败时抛出过期工具错误，不调用其他工作区实例。

## System-reminder 契约

工作区 notice 随 catalog 消息写入 `<system-reminder>`，并通过 `CatalogSource` 持久化、去重和投影确认。

- active：删除文件夹前必须 inactive；其他 active Agent 也会占用目录。
- inactive retained：当前 Agent 已 inactive，但其他 active Agent 仍占用文件夹。
- inactive closed：实例关闭结果与删除前置条件。
- workspace cleanup：旧路径、新路径、各服务器关闭结果。
- workspace missing：缺失路径与关闭结果。
- cleanup failed/unknown：明确不得把当前状态视为删除许可。

## MCP 上下文契约

### Instructions

`system-prompt/assemble` 仅保留当前工作区且 active 的内部 `mcp:<internalName>` section，并把标题中的内部名称还原为公开配置名。

### Resources

Agent-local provider 使用公开配置名。三种请求转发到当前工作区内部 provider：

- `resources/list`
- `resources/templates/list`
- `resources/read`

inactive 或工作区失效时释放 provider。直接调用全局 resource 工具访问本插件内部名称时，`tools/pre-execute` 返回拒绝。共享服务器的资源行为保持不变。
