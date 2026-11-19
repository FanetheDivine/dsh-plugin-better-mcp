# Feature Specification: Turn 结束后自动停用 MCP

**Feature Branch**: `feat/019-deactivate-after-turn`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "增加mcp在每个turn结束后自动inactive的功能"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 下一 Turn 恢复精简工具集 (Priority: P1)

用户在一个 Turn 中启用 MCP 服务器并完成任务。Turn 结束后，这些服务器自动变为 inactive，后续 Turn 按需要重新启用。

**Why this priority**: 避免已用完的 MCP 工具持续占用后续对话的工具空间。

**Independent Test**: 在一个会话中启用一台服务器，完成当前 Turn 后开始下一 Turn，确认该服务器已变为 inactive，且仍可重新启用。

**Acceptance Scenarios**:

1. **Given** 当前 Turn 中有一台 active 的 MCP 服务器， **When** 当前 Turn 结束， **Then** 该服务器在该会话中变为 inactive。
2. **Given** 一台服务器因 Turn 结束而变为 inactive， **When** 后续 Turn 再次启用它， **Then** 它的工具可正常使用到该 Turn 结束。
3. **Given** 当前 Turn 中有多台 active 的 MCP 服务器， **When** 当前 Turn 结束， **Then** 这些服务器全部变为 inactive。

---

### User Story 2 - 保持会话相互独立 (Priority: P2)

用户同时处理多个会话或子代理任务。一个 Agent 的 Turn 结束只重置该 Agent 的 MCP 可见性。

**Why this priority**: 其他正在进行的任务仍需要自己的 MCP 工具。

**Independent Test**: 两个 Agent 分别启用不同服务器，结束其中一个 Agent 的 Turn，确认另一个 Agent 的可见性不变。

**Acceptance Scenarios**:

1. **Given** 两个 Agent 各自有 active 的 MCP 服务器， **When** 其中一个 Agent 的 Turn 结束， **Then** 只有该 Agent 的服务器变为 inactive。
2. **Given** 子代理在自己的 Turn 中启用 MCP 服务器， **When** 子代理的 Turn 结束， **Then** 父代理的可见性不变。

### Edge Cases

- 当前 Turn 没有 active 的 MCP 服务器时，Turn 结束保持现状，不产生重复变化提醒。
- Turn 正常完成、失败或取消后，都执行相同的重置。
- 自动重置不关闭服务器连接，也不改变服务器的默认可见性配置。
- 自动重置只更新会话状态，不主动发起新的模型请求。
- 会话恢复后保留最近一次 Turn 结束时的 inactive 状态。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系统 MUST 在每个 Agent 的每个 Turn 结束后，把该 Agent 当前 active 的全部 MCP 服务器设为 inactive。
- **FR-002**: 系统 MUST 在下一次模型步骤开始前完成工具可见性重置。
- **FR-003**: 系统 MUST 让所有默认可见性配置在 Turn 结束时统一重置为 inactive。
- **FR-004**: 自动重置 MUST 只影响结束当前 Turn 的 Agent，其他 Agent 的可见性保持不变。
- **FR-005**: 自动重置 MUST 保留服务器连接与服务器定义。
- **FR-006**: 系统 MUST 按现有目录提醒机制记录自动重置结果，并在后续模型步骤提供准确目录。
- **FR-007**: 当前 Turn 没有可见性变化时，系统 MUST 跳过重复提醒。
- **FR-008**: 用户或模型 MUST 能在后续 Turn 中重新启用已自动重置的服务器。

### Key Entities *(include if feature involves data)*

- **Agent 会话可见性**: 每台 MCP 服务器在一个 Agent 中的 active 或 inactive 状态。
- **Turn**: 一个 Agent 从接收输入到完成响应的一次执行周期。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% 的已结束 Turn 中，该 Agent 的 active MCP 服务器在下一模型步骤前全部变为 inactive。
- **SC-002**: 自动重置对其他 Agent 的可见性影响数为 0。
- **SC-003**: 没有 active 服务器的 Turn 结束时，重复目录提醒数为 0。
- **SC-004**: 自动重置后，服务器重新启用与工具调用的成功率为 100%。

## Assumptions

- “MCP”指本插件管理的全部服务器，包括默认 active 与默认 inactive 的服务器。
- 自动重置始终启用，不新增配置开关。
- 每个子代理按自己的 Turn 独立重置。
- Turn 结束后的重置沿用现有会话可见性与目录提醒行为。
