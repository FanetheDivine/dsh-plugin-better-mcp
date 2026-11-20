# Research: Workspace 级 MCP 实例

## 工作区身份与切换

**Decision**: 使用 `ctx.workingDirectory.get(agent.session)` 返回的当前有效目录作为工作区身份。需要目录恢复或校验时使用 `ensure(agent)`。

**Rationale**: `header.cwd` 只表示创建时目录。`working_directory` 与 `create_worktree` 可以切换同一 Agent 的当前目录，不会再次触发 `agent/created`。

**Alternatives Considered**: 使用 GUI Workspace id 无法覆盖 worktree 内切换；使用 `header.cwd` 会忽略切换。

关键行为：

- `working-directory/access` 在目录提交前运行，可提前准备目标实例。
- `working-directory/change` 经 `session/event` 发布，提交后可读取新目录。
- 宿主解析并规范化本地路径，符号链接使用解析后的目标身份。
- `agent/created` 建立初始绑定；成功切换更新绑定；`agent/disposed` 释放引用。

## 宿主版本与依赖

**Decision**: 把全部直接 `@deepseek-ai/dsh-*` 开发依赖从 rc.3 同步升级到 `0.2.2-rc.5`，并新增同版本的 `dsh-working-directory`、`dsh-system-prompt`、`dsh-mcp-resources` 与实现直接引用的包。

**Rationale**: 当前实机为 rc.5。rc.3 开发依赖图没有 `dsh-working-directory`。混用版本违反项目宪章，也无法可靠编译和模拟新增接口。

**Alternatives Considered**: 保留 rc.3 并动态访问未声明服务会缺少类型与测试契约，而且与实机行为不一致。

依赖规则：

- 新增 `@deepseek-ai/dsh-working-directory@0.2.2-rc.5`。
- 直接引用 MCP Client 或 System Prompt 类型时，新增对应 rc.5 包。
- 所有直接新增的宿主包加入 `pnpm-workspace.yaml` 的精确 `minimumReleaseAgeExclude`。
- Cordis、loader、Schemastery 与 zod 的现有版本约束与 rc.5 一致。
- rc.3 与 rc.5 的 MCP Client 和 System Prompt 源码一致；Working Directory 是新增接入面。

## 现有挂载与命名约束

**Decision**: 共享服务器继续使用 `ServerManager` 和 `mcpManager.register()`。工作区服务器需要独立的实例注册与 Agent 路由层。

**Rationale**: MCP Manager 的注册名全局唯一，返回幂等 disposer，实例挂在全局 fiber。直接重复注册同一个配置名会冲突。

**Alternatives Considered**: 每 Agent 启动真实服务器能自然隔离，但违反同一工作区共享实例的已批准需求。

关键行为：

- 内部实例名必须满足宿主名称与公开工具名长度限制。
- 工作区实例需要稳定、冲突可控的内部名称。
- 注册释放只表示进入对账，调用者不能从 disposer 返回值等待进程关闭。
- Manager 全局操作串行；清理失败可能保留状态并阻止替换。

## 配置与项目路径

**Decision**: 保留现有严格配置解析。工作区级定义在交给 MCP Manager 前移除插件专有字段，并显式将 stdio `cwd` 设为所属工作区。

**Rationale**: Serena 可从 `cwd` 获取项目。用户确认仅使用 `cwd`，无需额外环境变量或参数插值。

**Alternatives Considered**: 新增 args/env 模板插值已被用户排除；HTTP 没有 stdio `cwd` 与 `env`，且已排除在工作区级能力之外。

## 生命周期与并发

**Decision**: 以“服务器配置名 + 规范化工作区路径”为实例键。active/inactive 引用与在线 Agent 绑定分开管理：active 才创建实例，inactive 在没有其他 active Agent 时关闭；Agent 释放保留实例；目录切换且旧工作区无其他绑定 Agent 时关闭全部旧实例。实例创建、激活引用与关闭按实例键串行。

**Rationale**: 同一工作区并发 active 只能注册一次。inactive 需要释放 cwd 占用，但不能中断其他 active Agent。Agent 释放后保留实例支持后续会话复用，目录切换需要确认旧文件夹可以删除。

**Alternatives Considered**: inactive 只隐藏工具会持续占用文件夹；单个 Agent inactive 直接关闭共享实例会中断其他 Agent；按 Turn 或 GUI 当前会话管理生命周期不符合工作区共享语义。

## 工具之外的贡献

**Decision**: 隔离范围必须包含 MCP instructions 与 resources。

**Rationale**: `dsh-mcp-client` 除工具外还注册系统提示 section 与 resource provider；`tools.restrict()` 只处理工具。

**Alternatives Considered**: 只限制工具会让其他工作区的 instructions 进入系统提示，无法满足项目上下文隔离。

## 关闭屏障与删除旧目录

**Decision**: `working-directory/access` 在 `next()` 提交新目录后，释放旧绑定并等待旧工作区全部工作区实例清理完成，再让切换工具返回。清理失败保持目录切换成功，记录错误并提醒暂不删除。

**Rationale**: Windows 实测表明，运行中的子进程以其目录为 cwd 时删除返回 `EPERM`，子进程关闭后可删除。等待关闭可避免后续删除与异步清理竞争。

**Alternatives Considered**: 仅调用 disposer 不等待会让删除先于进程退出；提交后抛错会破坏目录切换和 worktree 创建结果。

等待机制：

- 调用注册 disposer 后消费 `mcpManager.watch(signal)`。
- 内部名称从列表消失表示 Manager 已成功接受清理。
- `configured: false` 且 `failed/cleanup` 表示清理失败，返回结构化错误。
- 超时只表示清理状态未知，后台 watch 继续，删除协调器不得视为成功。
- 保证覆盖插件拥有的直接 stdio 子进程；其他进程与分离孙进程仍可能占用目录。

## 状态与删除提醒

**Decision**: 扩展 catalog 消息来源与渲染，支持一次性 workspace notice。active、inactive、目录切换、文件夹缺失和清理失败都通过 `agent.inject()` 写入下一步，不主动唤醒 idle Agent。

**Rationale**: 现有目录去重只比较服务器条目，连接生命周期变化可能不会生成消息。持久化 notice 可在 pre-step 重建并避免丢失。

提醒规则：

- active：删除文件夹前必须 inactive；共享实例有其他 active Agent 时说明这些 Agent 也占用目录。
- inactive 且仍共享：当前工具已隐藏，但实例仍被其他 active Agent 使用，文件夹仍被占用。
- inactive 且已关闭：说明直接 stdio 子进程关闭结果。
- 切换成功且旧实例关闭：说明旧目录可由宿主或文件工具删除，仍可能存在其他占用。
- 清理失败：说明服务器、路径和错误，明确暂不删除。

## Agent 代理与连接访问

**Decision**: 使用“全局内部名真实实例 + Agent-local 公开名代理”。代理捕获目标 `ToolDefinition` 并直接调用其 `execute()`，同时委托 `projectContent` 与 `finalizeContent`。

**Rationale**: Agent-local 工具可以 shadow 全局工具，并绕过全局内部名称冲突。直接调用目标定义不会再次进入内部工具查找、deny 或工具管线；公开代理仍经过当前 Agent 的策略、日志、取消与结果处理。委托内容投影可保留 MCP 图片结果。

**Alternatives Considered**: 再次调用 `ctx.tools.execute()` 会被内部 deny 拦截并重复经过工具管线。直接使用 MCP SDK 需要自行实现发现、重连、模板、状态和清理，且仍需共享连接桥接。

代理同步规则：

- 从根 `ctx.tools.definitions()` 按精确内部前缀发现完整定义。
- 每个 Agent 按公开名保存 target、工作区键与 disposer。
- target 身份不变时保留代理；新增、消失或换代时按差异注册与释放。
- 工作区切换释放旧代理并建立新代理。
- 执行时校验 target 身份和 Agent 当前绑定，拒绝过期调用。
- 全部内部工具始终 deny；代理注册与限制同步使用稳定差异避免递归。

### Instructions

在 `system-prompt/assemble` 的 `next()` 之后过滤本插件内部 section。仅保留当前工作区的内部 instructions，并把显示名还原为服务器配置名。共享服务器 section 保持原样。

### Resources

在 Agent scope 以公开服务器名注册 resource provider。Provider 捕获三个全局 resource 工具定义，将 `server` 改为内部实例名，并以 `agent: undefined` 的执行视图直接调用目标定义。

- Agent-local resource 工具 shadow 全局同名工具，模型使用公开服务器名。
- 全局 resource 工具的 `tools/pre-execute` 守卫拒绝直接访问工作区内部名。
- `mcp-resource-servers` prompt 只显示公开服务器名。
- 该转发依赖 rc.5 的 resource 执行视图，需要单元与实机测试固定。

### 名称边界

普通短合法工具名可通过前缀替换得到标准公开名。宿主对有损规范化名称使用 `(serverName, rawName)` 计算哈希，而管理器只暴露内部公开名，代理无法还原 `rawName`。

- 要完整支持这类名称，需要修改宿主桥接或改用自定义 MCP 发现层。
- Serena 的普通短工具名不受影响。
- 使用宿主生成的规范化名称，普通名称仅替换服务器前缀。该行为不列为已知风险。

## 最小模块划分

| 模块 | 责任 |
| --- | --- |
| `workspace-names.ts` | 工作区键、内部名称、公开代理名与 section 名 |
| `workspace-pool.ts` | 实例注册、Agent 引用、状态、重启、配置版本与清理 |
| `workspace-bindings.ts` | Agent 创建/释放、目录切换、绑定与回滚 |
| `workspace-notices.ts` | active/inactive、共享占用、目录缺失与关闭结果提醒 |
| `workspace-proxy.ts` | 工具发现、代理差异同步、内部 deny 与过期调用检查 |
| `workspace-presentation.ts` | instructions 与 resource 服务器提示过滤 |
| `workspace-resources.ts` | Agent-local provider、资源转发与内部调用守卫 |

现有 `servers.ts` 保留共享服务器管理并暴露工作区状态；`visibility.ts` 合并 lazy 限制与代理同步；`index.ts` 接入工作目录、系统提示、资源守卫和生命周期钩子。
