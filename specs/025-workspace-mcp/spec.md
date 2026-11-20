# Feature Specification: Workspace 级 MCP 实例

**Feature Branch**: `feat/025-workspace-mcp`

**Created**: 2026-11-20

**Status**: Approved

**Input**: User description: "为 MCP 增加 workspace 级别配置。Serena 一个实例只服务一个项目；并行使用 workspace/create_workspace/work_directory 时，每个 agent 占有的工作区都需要独立的 Serena 实例。"

## Open Decisions

<!--
Status values:
- Draft: the current full document is not approved or waived.
- Approved: the user approved the current full document.
- Waived: the user waived the review and accepted the recorded risks.
Record each undecided question with a stable id and its dependencies.
-->

- 无。

## Clarifications

### Session 2026-11-20

- 用户反馈：active 返回 `connecting` 不符合预期；调用必须等待实例成功连接。
- [D-019] 探索结论：宿主连接具有重试预算耗尽后的最终失败状态。active 仅在连接成功后返回成功；最终失败或调用取消时明确失败并恢复 inactive。

探索结果：

- 现有插件在启动时为每台服务器挂载一个实例，`lazy` 只控制会话工具可见性。
- 现有配置支持 `stdio` 与 `streamable-http`，并提供 stdio 的 `cwd`、`args` 与 `env`。
- OAuth 凭据按服务器名保存。工作区级实例沿用同一服务器配置的公共设置与鉴权，首版不提供工作区独立鉴权。
- 面板按服务器配置展示状态。工作区级状态需要保留工作区归属。
- [D-001] 探索结论：工作区使用宿主提供的会话当前有效工作目录。`working_directory` 与 `create_worktree` 切换该目录时不新建 Agent，因此切换后必须更新绑定。宿主会解析并规范化目录路径。
- [D-002] Q: 多个 Agent 使用同一个工作区时，应共享一个 MCP 实例，还是每个 Agent 各有一个实例？ -> A: 同一个实例；同一工作区跨 Agent 共享。
- [D-003] Q: 现有 MCP 配置如何启用工作区级行为？ -> A: 每台服务器显式启用，默认保持共享实例；在“懒加载”右侧增加“工作区级实例”开关，并提供问号帮助说明。
- [D-007] Q: 工作区级能力支持哪些服务器连接方式？ -> A: 仅 stdio MCP 提供工作区级实例能力。
- [D-004] Q: stdio 服务器如何获得所属项目路径？ -> A: 将所属工作区设为实例 cwd，并注入包含该路径的环境变量；开关帮助说明这两项行为，不增加参数占位符。
- [D-004] Q: 是否仍需注入工作区路径环境变量？ -> A: 不需要；cwd 已足够，仅保留工作区 cwd 与对应帮助说明。
- [D-005] Q: 工作区级实例何时停止？ -> A: 工作区仍有在线 Agent 时保留实例，最后一个在线 Agent 释放后停止。
- [D-008] Q: 工作区级实例何时启动？ -> A: Agent 的工作区确定后启动该工作区的全部工作区级服务器；lazy 继续只控制工具可见性。
- [D-009] Q: 面板如何呈现多个工作区实例？ -> A: 任一工作区已连接时主行显示“已连接”；下方仅显示失败工作区信息，并可折叠为“查看报错”。
- [D-012] Q: 工作区级服务器如何设置懒加载？ -> A: 必定懒加载，隐藏“懒加载”开关。
- [D-013] Q: 工作区级实例何时连接，inactive 是否断连？ -> A: 仅在模型 active 时尝试连接；inactive 只隐藏工具，不断连。
- [D-014] Q: 工作区级实例何时断连并提醒？ -> A: 工作区文件夹缺失或 Agent 切换工作目录时断连，并注入特殊 system-reminder。
- [D-015] Q: 面板如何展示和管理实例？ -> A: 不显示“已连接”标签；可折叠“连接情况”按成功和失败分组；支持全部重连、单工作区重连和工作区搜索。
- [D-016] Q: 切换目录后能否删除旧文件夹？ -> A: 目标行为为旧实例关闭后可直接删除，需要实机验证。
- [D-010] Q: 工作区没有任何在线 Agent 时是否保留已连接实例？ -> A: 保留，直到文件夹缺失、宿主退出或后续工作区切换规则触发。
- [D-011] Q: 工作区文件夹被外部删除后何时检测并断连？ -> A: 在 Agent 下一步和激活调用前检查，发现缺失后断连并注入提醒。
- [D-017] Q: inactive 是否断连，active 提供什么提醒？ -> A: inactive 直接断连；active 时注入 system-reminder，说明必须 inactive 才能删除文件夹。
- [D-018] Q: 同一工作区多个 Agent 共享实例时，一个 Agent inactive 是否立即断连？ -> A: 该 Agent 立即隐藏工具；仅当工作区没有其他 active Agent 时断连。提醒必须说明 inactive 后实例仍被其他 Agent 占用的情况。
- 宿主 MCP 管理器按全局唯一服务器名注册实例。同名多实例需要额外的工作区路由与工具、提示、资源隔离。
- 宿主没有内建工作区路径变量；stdio 支持 `cwd`、`args`、`env`，HTTP 支持 `url`、`headers`。
- 开发依赖与实机宿主统一为 DSH `0.2.2-rc.5`。新增宿主接口按该版本的公开声明与源码契约实现。
- 目录切换提交后可等待旧实例清理完成，再让切换工具返回。清理失败不改变已提交目录，并注入包含原因的提醒。
- MCP Manager 的 disposer 不可等待；使用 `watch()` 确认内部名称消失或清理失败。
- 成功清理确认插件拥有的直接 stdio 子进程已关闭。其他进程与分离孙进程仍可能占用文件夹。
- Windows 临时目录实验确认：运行中的子进程以其目录为 cwd 时删除返回 `EPERM`；子进程关闭后同一目录可删除。
- 断连提醒复用现有 catalog 的 `agent.inject()` 通道，并随目录消息持久化到下一步。

## Review Record

- 2026-11-20 | Decision: Approved | Scope: current full document | Open items: none | Risks: 连接等待与失败恢复

- 2026-11-20 | Decision: Changes requested | Scope: active 必须等待连接成功 | Open items: D-019 | Risks: 连接重试期间的调用等待与失败恢复

- 2026-11-20 | Decision: Approved | Scope: current full document | Open items: none | Risks: 共享实例路由复杂度；开发依赖 rc.3 与实机 rc.5 的版本差异
- 2026-11-20 | Decision: Changes requested | Scope: 删除工作区环境变量，仅保留 cwd | Open items: none | Risks: 共享实例路由复杂度；宿主资源路由耦合
- 2026-11-20 | Decision: Approved | Scope: current full document | Open items: none | Risks: 共享实例路由复杂度；宿主资源路由耦合
- 2026-11-20 | Decision: Changes requested | Scope: 面板聚合状态与可折叠错误列表 | Open items: none | Risks: 共享实例路由复杂度；宿主资源路由耦合
- 2026-11-20 | Decision: Approved | Scope: current full document | Open items: none | Risks: 共享实例路由复杂度；宿主资源路由耦合
- 2026-11-20 | Decision: Changes requested | Scope: 固定懒加载、active 启动、指定事件断连、连接分组与搜索 | Open items: D-010, D-011 | Risks: 进程关闭与文件夹删除时序；宿主资源路由耦合
- 2026-11-20 | Decision: Changes requested | Scope: inactive 断连与 active 删除警告 | Open items: D-018 | Risks: 共享实例断连影响其他 Agent；进程关闭时序
- 2026-11-20 | Decision: Approved | Scope: current full document | Open items: none | Risks: 共享实例断连与提醒时序；宿主资源路由耦合；其他进程占用文件夹

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 按需连接每个工作区的独立实例 (Priority: P1)

用户把 Serena 配置为工作区级 MCP。工作区级服务器始终懒加载，只有模型调用 `mcp_manage` 将其设为 active 时才连接所属工作区实例。active 调用等待实例连接成功后返回成功。active 时注入 system-reminder，说明删除文件夹前必须 inactive，并提示共享实例仍可能被其他 Agent 占用。

**Why this priority**: 按需连接减少空闲进程，同时保证每个项目使用独立 Serena 实例。

**Independent Test**: 在两个工作区分别激活同一 Serena 配置，确认激活前无实例，激活后各有一个实例且 cwd 正确。

**Acceptance Scenarios**:

1. **Given** 工作区级 Serena 配置和一个已确定工作区的 Agent，**When** 模型尚未激活 Serena，**Then** 系统不启动该工作区的 Serena 实例。
2. **Given** 两个不同工作区，**When** 两个 Agent 分别激活 Serena，**Then** 系统建立两个独立实例、设置各自 cwd，并注入删除文件夹前必须 inactive 的提醒。
3. **Given** 多个 Agent 绑定同一工作区，**When** 它们激活同一服务器，**Then** 它们共享同一个实例，提醒说明其他 active Agent 会继续占用文件夹。
4. **Given** 工作区实例需要经过连接中状态，**When** 模型调用 active，**Then** 调用等待到连接成功后才返回成功，且成功结果与提醒均不显示 `connecting`。

---

### User Story 2 - inactive 断连并释放文件夹占用 (Priority: P2)

用户 inactive 一台工作区级服务器时立即隐藏工具。没有其他 active Agent 使用同一实例时，系统断连实例；仍有其他 active Agent 时保留实例并注入文件夹仍被占用的提醒。Agent 切换工作目录或工作区文件夹消失时也断连失效实例并提醒。

**Why this priority**: inactive 断连释放插件拥有的 cwd 占用，共享状态提醒避免用户误以为文件夹已经可以删除。

**Independent Test**: 验证单 Agent inactive 后实例关闭；共享实例仍有 active Agent 时保留并提醒；切换目录后旧实例关闭且下一步出现提醒。

**Acceptance Scenarios**:

1. **Given** 一个仅被当前 Agent 使用的已连接实例，**When** 模型将其设为 inactive，**Then** 工具隐藏、实例断连，下一步包含关闭结果提醒。
2. **Given** 一个仍被其他 active Agent 使用的共享实例，**When** 当前 Agent 将其设为 inactive，**Then** 当前工具隐藏、实例保持连接，并提醒文件夹仍被其他 Agent 占用。
3. **Given** Agent 从工作区 A 切换到 B 且 A 没有其他绑定 Agent，**When** 切换完成，**Then** A 的实例断连，后续步骤包含断连 system-reminder。
4. **Given** 旧工作区 A 的实例已因切换或 inactive 断连，**When** 用户删除 A 文件夹，**Then** 删除不受 A 的 MCP 直接子进程占用影响。
5. **Given** 工作区文件夹已不存在，**When** 系统检测到缺失，**Then** 对应实例断连并向受影响 Agent 注入 system-reminder。

---

### User Story 3 - 分组查看和重连工作区实例 (Priority: P3)

用户在工作区配置的“连接情况”中按成功和失败分组查看实例。分组可折叠，工作区名称可搜索，并可全部重连或单工作区重连。

**Why this priority**: 连接情况面向实际排障，搜索和分组使用户能管理多个工作区。

**Independent Test**: 构造多个成功与失败实例，展开分组、搜索路径并分别执行全部重连和单实例重连。

**Acceptance Scenarios**:

1. **Given** 同一配置有成功和失败实例，**When** 用户展开“连接情况”，**Then** 成功与失败分组分别展示工作区路径和状态。
2. **Given** 多个工作区实例，**When** 用户输入名称片段，**Then** 列表只显示匹配的工作区。
3. **Given** 一个失败实例和多个健康实例，**When** 用户在该工作区行点击“重连”，**Then** 仅该实例重连。
4. **Given** 多个工作区实例，**When** 用户点击“全部重连”，**Then** 该配置的现有实例全部重连。

---

### User Story 4 - 现有共享型 MCP 保持可用 (Priority: P4)

用户只把需要项目隔离的 stdio 服务器设为工作区级，其他服务器继续沿用现有共享使用方式。

**Why this priority**: 该能力可逐步采用，既有配置保持兼容。

**Independent Test**: 同时配置一个工作区级服务器和一个共享服务器，确认两者启动、可见性和重连行为各自正确。

**Acceptance Scenarios**:

1. **Given** 已有的共享服务器配置，**When** 用户未启用工作区级别，**Then** 该服务器的使用方式保持不变。
2. **Given** 一个 HTTP MCP 配置，**When** 用户查看表单，**Then** 不显示工作区级开关，服务器继续使用共享实例。

### Edge Cases

- 同一工作区多个 Agent 同时首次 active 时，每台工作区级服务器只建立一个实例。
- 一个 Agent 切换目录时，旧工作区仍有其他 Agent 绑定则保留旧实例。
- Agent 切回已有连接的工作区时复用实例，无需重复启动。
- 工作区路径包含空格、非 ASCII 字符或符号链接时，实例身份与 cwd 保持正确。
- 工作区级实例启动失败或崩溃时，其他工作区实例继续可用。
- active 等待期间连接最终失败或调用取消时，调用明确失败并恢复 inactive，不开放未确认可用的工具。
- 文件夹在实例关闭完成前收到删除请求时，系统需要避免旧进程继续占用文件夹。
- 工作区实例断连后，旧代理、instructions 与 resources 不得继续对失效绑定可用。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 用户 MUST 能通过“工作区级实例”开关为单个 stdio MCP 显式启用工作区级别；该开关 MUST 提供问号帮助。
- **FR-002**: 工作区级服务器 MUST 始终懒加载；启用后表单 MUST 隐藏“懒加载”开关。
- **FR-003**: 系统 MUST 仅在模型调用 `mcp_manage` 将工作区级服务器设为 active 后尝试连接当前工作区实例，并注入删除文件夹前必须 inactive 的 system-reminder。
- **FR-004**: 将工作区级服务器设为 inactive MUST 立即隐藏当前 Agent 的工具；该工作区没有其他 active Agent 时 MUST 断连实例。
- **FR-005**: 系统 MUST 将工作区级 stdio 实例的 cwd 设为所属工作区的规范化绝对路径。
- **FR-006**: 使用同一工作区的多个 Agent MUST 共享一个服务器实例；并发首次 active 时 MUST 只建立一个实例。
- **FR-007**: 不同工作区的实例 MUST 能并行运行，且项目上下文互不串扰。
- **FR-008**: Agent 切换工作目录后，系统 MUST 解绑旧工作区；旧工作区无其他绑定 Agent 时 MUST 断连其工作区实例。
- **FR-009**: 系统 MUST 在 Agent 下一步和激活调用前检查工作区文件夹；发现不存在时断连对应实例。
- **FR-010**: active、inactive、工作区切换或文件夹缺失后，系统 MUST 注入特殊 system-reminder，说明连接状态、文件夹占用与删除前置条件；共享实例仍被其他 active Agent 使用时 MUST 明确说明文件夹仍被占用。
- **FR-011**: 系统 MUST 在后续工具删除旧工作区文件夹前完成旧实例关闭；关闭失败时 MUST 显示明确错误。
- **FR-012**: 系统 MUST 将工具发现、工具调用、状态和错误路由到 Agent 当前工作区的实例。
- **FR-013**: 工作区级实例提供的工具、MCP instructions 与 resources MUST 仅对绑定该工作区的 Agent 可用。
- **FR-014**: 面板 MUST 在工作区配置下方提供可折叠的“连接情况”，按成功和失败分组展示工作区路径、状态与错误，不显示“已连接”标签。
- **FR-015**: 工作区配置 MUST 提供“全部重连”，每个工作区实例 MUST 提供单独的“重连”。
- **FR-016**: 用户 MUST 能按工作区名称或路径片段搜索实例。
- **FR-017**: 工作区级实例 MUST 继承同一服务器配置的公共启动设置。
- **FR-018**: 工作区级实例的启动失败、崩溃或停止 MUST 仅影响其所属工作区。
- **FR-019**: 未启用工作区级别的 MCP 服务器 MUST 保持现有行为，既有配置 MUST 默认关闭工作区级别。
- **FR-020**: HTTP MCP MUST 保持共享实例行为且不显示工作区级开关。
- **FR-021**: Agent 释放导致工作区没有在线 Agent 时 MUST 保留已连接实例；目录切换仍按 FR-008 断连，宿主退出时释放全部实例。
- **FR-022**: 工作区实例的 active 调用 MUST 等待到实例连接成功后才返回成功；最终连接失败或取消时 MUST 返回明确错误并恢复 inactive。

### Key Entities *(include if feature involves data)*

- **Workspace**: Agent 当前操作的项目工作区，以宿主提供的规范化当前有效工作目录标识。
- **MCP Server Configuration**: 用户维护的服务器定义，包含共享或工作区级使用方式及公共启动设置。
- **Workspace MCP Instance**: 某个服务器配置在某个工作区中的独立运行实例，具有项目路径、连接状态、工具集合和错误信息。
- **Session Binding**: 会话与工作区之间的当前关联，决定工具与状态路由目标。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 两个工作区中的 Agent 在 active 前均无工作区实例；分别 active 后可观察到两个实例，且 cwd 与所属工作区完全一致。
- **SC-002**: 三个工作区各执行至少 20 次并行工具调用时，全部调用均由正确工作区的实例处理，无跨工作区结果或上下文混入。
- **SC-003**: 单 Agent inactive 后实例进程关闭；共享实例仍有其他 active Agent 时保持连接并注入文件夹仍被占用的提醒；active 提醒明确删除前必须 inactive。
- **SC-004**: 在 Windows 实机验证中，切换工作目录并关闭旧实例后，无其他进程占用时可直接删除旧工作区文件夹；关闭失败时显示明确错误。
- **SC-005**: 面板可将成功与失败实例分组折叠展示，按名称片段筛选，并验证全部重连与单工作区重连的范围正确。
- **SC-006**: 一个工作区实例发生启动失败或崩溃时，其他工作区实例的工具调用不受该故障影响。
- **SC-007**: 未启用工作区级别的既有服务器配置在升级后无需修改即可按原方式使用。
- **SC-008**: 使用需要经过 `connecting` 的真实 stdio MCP 验证 active 仅在 `connected` 后成功返回；最终失败时返回错误且该 Agent 为 inactive。

## Assumptions

- 本次范围覆盖本插件管理的 MCP 服务器，不改变 Serena 本身的单项目限制。
- 工作区级能力仅面向需要项目隔离的 stdio MCP 服务器。
- 工作区级实例的工具命名与既有 MCP 工具体验保持一致，模型继续使用 `mcp__<server>__<tool>` 形式。
- 工作区文件系统权限由宿主现有机制管理，本功能不扩展权限边界。
- 文件夹删除由宿主或文件工具执行；本插件负责关闭其拥有的工作区 MCP 实例并报告清理结果。
