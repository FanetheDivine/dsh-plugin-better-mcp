# Feature Specification: 工作区级 MCP 在 Turn 结束与 inactive 时可靠释放

**Feature Branch**: `feat/027-workspace-mcp-lifetime`

**Created**: 2026-11-21

**Status**: Approved

**Input**: User description: "本次变更只针对工作区级 MCP；不做空闲回收；Turn 结束或 inactive 时，若同一工作区没有其他 Agent 正在激活该 MCP，则销毁实例；active 提醒说明其他 Agent 可能占用工作区，以及进程销毁可能延迟。MCP 行为保持简单清晰，不增加假设或隐藏功能。"

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

### Session 2026-11-21

- [D-001] Q: 变更范围？ -> A: 只针对工作区级 MCP；共享实例保持现有行为。
- [D-002] Q: 是否空闲回收？ -> A: 不做空闲回收。
- [D-003] Q: Turn 结束与 inactive 如何处理实例？ -> A: 始终隐藏工具；同一工作区没有其他 Agent 正在激活该 MCP 时销毁实例。
- [D-004] Q: active 提醒写什么？ -> A: 说明其他 Agent 可能占用同一工作区，进程销毁可能延迟。
- 设计原则：MCP 行为保持简单清晰，不增加假设或隐藏功能。
- [D-005] 探索结论：当前 Turn 结束释放读取的是已被重置的可见性，待释放列表通常为空，实例没有关闭。依据：会话投影在同一个 `turn/end` 事件上先把全部服务器重置为 inactive，插件随后才判断哪些服务器需要释放。2026-11-21 实测 Serena 实例在 Turn 结束后持续运行。
- [D-006] Q: inactive 与 Turn 结束释放后是否注入提醒？ -> A: 不注入；inactive 的工具结果给出关闭结果与占用说明。
- [D-007] Q: 切换工作目录时旧工作区没有实例，是否注入清理提醒？ -> A: 不注入；只在实例被保留、关闭、清理失败或未确认时提醒。
- 探索结论：手动 inactive 正确关闭实例，Serena 收到 stdin 结束信号后整棵进程树正常退出。
- 探索结论：子代理与主 Agent 一样能看到 MCP 目录并调用 `mcp_manage`，在同一工作区 active 时共享实例。

## Review Record

- 2026-11-21 | Decision: Approved | Scope: current full document | Open items: none | Risks: 关闭只保证直接 stdio 子进程；每次 active 冷启动

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Turn 结束释放工作区实例 (Priority: P1)

模型在一个 Turn 内 active 工作区级 Serena 并使用工具。Turn 结束后工具隐藏；同一工作区没有其他 Agent 正在激活 Serena 时，实例关闭，不再占用工作区文件夹。

**Why this priority**: 当前 Turn 结束不释放实例，进程残留并占用文件夹，是本次要修复的缺陷。

**Independent Test**: active 后结束 Turn，确认工具隐藏且实例进程退出；另一个 Agent 同时 active 时，确认实例保留。

**Acceptance Scenarios**:

1. **Given** 只有当前 Agent 激活的工作区实例，**When** Turn 结束，**Then** 工具隐藏，实例关闭。
2. **Given** 同一工作区另一个 Agent 也激活了该服务器，**When** 当前 Agent 的 Turn 结束，**Then** 当前 Agent 的工具隐藏，实例保持运行。
3. **Given** 一个 Turn 内 active 后又 inactive 的服务器，**When** Turn 结束，**Then** 不重复关闭，也不报错。
4. **Given** 上一个 Turn 结束时已关闭的实例，**When** 下一个 Turn 再次 active，**Then** 系统启动新实例并在连接成功后返回。

---

### User Story 2 - inactive 释放工作区实例 (Priority: P1)

模型在 Turn 中调用 inactive。工具立即隐藏；同一工作区没有其他 Agent 正在激活该服务器时，实例关闭，工具结果给出关闭结果。

**Why this priority**: inactive 是删除工作区文件夹前的手动出口，行为必须与 Turn 结束一致。

**Independent Test**: active 后调用 inactive，确认工具结果为已关闭且进程退出；共享时确认结果为保留并说明原因。

**Acceptance Scenarios**:

1. **Given** 只有当前 Agent 激活的实例，**When** 模型调用 inactive，**Then** 工具隐藏，实例关闭，工具结果为已关闭。
2. **Given** 另一个 Agent 也激活了该服务器，**When** 当前 Agent inactive，**Then** 实例保持运行，工具结果说明其他 Agent 仍在使用。
3. **Given** 实例关闭超时或失败，**When** inactive 返回，**Then** 工具结果给出未确认或失败状态，且不表述为可以删除文件夹。

---

### User Story 3 - active 提醒说明占用与延迟 (Priority: P2)

模型 active 工作区级服务器后收到提醒：实例以当前工作区为 cwd；其他 Agent 可能同时占用该工作区；实例关闭可能延迟。

**Why this priority**: 模型据此判断何时可以删除工作区文件夹。

**Independent Test**: active 后检查下一步注入的提醒，确认包含其他 Agent 占用与关闭延迟两项说明。

**Acceptance Scenarios**:

1. **Given** 工作区级服务器，**When** 模型 active 成功，**Then** 下一步提醒说明实例占用当前工作区、其他 Agent 可能占用同一工作区、关闭可能延迟。
2. **Given** 共享服务器，**When** 模型 active，**Then** 不注入工作区提醒。

### Edge Cases

- 同一 Agent 在一个 Turn 内多次 active 与 inactive，Turn 结束时只按最终状态释放一次。
- 当前 Agent 的 Turn 结束时，另一个 Agent 正在等待同一实例连接成功，实例保留。
- Turn 内切换工作目录时，旧工作区实例已按切换规则处理；Turn 结束只释放当前仍激活的实例。
- 关闭超时返回后，后台关闭仍在进行；再次 active 时等待旧实例清理完成。
- 宿主退出时全部实例关闭。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 本次行为变更 MUST 只作用于工作区级 MCP；共享实例的可见性、挂载与重连行为 MUST 保持不变。
- **FR-002**: 系统 MUST NOT 因空闲时长关闭实例。
- **FR-003**: Turn 结束时，系统 MUST 隐藏该 Agent 的工作区级工具。
- **FR-004**: Turn 结束时，系统 MUST 释放该 Agent 当前仍激活的全部工作区级实例引用。
- **FR-005**: inactive 时，系统 MUST 隐藏当前 Agent 的工具并释放其实例引用。
- **FR-006**: 释放后同一工作区没有其他 Agent 正在激活该服务器时，系统 MUST 关闭实例。
- **FR-007**: 释放后同一工作区仍有其他 Agent 正在激活该服务器时，系统 MUST 保持实例运行。
- **FR-008**: inactive 的工具结果 MUST 给出关闭、保留、失败或未确认的结果。
- **FR-009**: active 提醒 MUST 说明实例以当前工作区为 cwd 并占用该文件夹。
- **FR-010**: active 提醒 MUST 说明其他 Agent 可能同时占用同一工作区。
- **FR-011**: active 提醒 MUST 说明实例关闭可能延迟。
- **FR-012**: 关闭超时或失败时，提醒与工具结果 MUST NOT 表述为可以删除文件夹。
- **FR-013**: 切换工作目录、工作区文件夹缺失与宿主退出时的现有关闭行为 MUST 保持不变。
- **FR-014**: inactive 与 Turn 结束释放后，系统 MUST NOT 注入额外提醒。
- **FR-015**: 切换工作目录或文件夹缺失时，系统 MUST 只在旧实例被保留、关闭、清理失败或未确认时注入提醒。

### Key Entities *(include if feature involves data)*

- **Workspace MCP Instance**: 某服务器配置在某工作区中的运行实例，以该工作区为 cwd。
- **Active Reference**: 某 Agent 对某工作区实例的激活引用，由 active 建立，由 inactive 或 Turn 结束释放。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 单个 Agent active 后 Turn 结束，实例进程退出，工作区文件夹不再被插件拥有的 MCP 进程占用。
- **SC-002**: 两个 Agent 在同一工作区 active，其中一个 Turn 结束或 inactive 后，另一个仍可调用工具。
- **SC-003**: 最后一个激活的 Agent 释放后，实例关闭。
- **SC-004**: active 提醒包含其他 Agent 占用与关闭延迟两项说明。

## Assumptions

- 关闭只保证插件拥有的直接 stdio 子进程，沿用现有已知风险。
- 每次 active 都重新启动实例，冷启动与服务端预热耗时由服务器自身决定。
- 面板的连接情况与重连功能保持现有行为。
