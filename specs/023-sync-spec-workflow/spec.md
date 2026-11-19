# Feature Specification: 同步 Spec Kit 访谈与审查流程

**Feature Branch**: `feat/023-sync-spec-workflow`

**Created**: 2026-11-19

**Status**: Waived

**Input**: User description: "按 dsh-plugin-template 最新提交 03c8e9e 更新本仓库的 Spec Kit 流程。"

## 待确认决策

无。

## 澄清记录

### 2026-11-19 会话

- 用户确认完全采用模板提交 `03c8e9e` 的流程设计，后续不再提问。
- 用户确认本仓库保留项目专有说明与发布历史，只同步模板提交中的通用 Spec Kit 流程规则。
- 用户确认完成检查后自动创建并合并 PR。

## 审查记录

- 2026-11-19 | 决定：Waived | 范围：当前完整规格 | 未确认事项：无 | 风险：流程文件未经逐段人工审阅，后续使用偏差通过后续变更修正。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 使用完整的访谈与审查流程 (Priority: P1)

维护者在本仓库提出变更后，Agent 先生成规格草稿，再完成需求探索与分批访谈。规格获得完整批准后，Agent 制定计划并完成实现细节访谈。计划获得完整批准后，流程才进入任务分解与实现。

**Why this priority**: 本仓库需要与模板仓库保持一致的 Spec Kit 决策确认和审查门禁，减少未确认需求与实现选择进入交付。

**Independent Test**: 分别使用规格未批准、规格已批准但计划未批准、规格与计划均已批准的输入运行流程，检查各阶段入口和出口。

**Acceptance Scenarios**:

1. **Given** 规格草稿已生成，**When** specify 完成，**Then** 流程固定进入 clarify，且不直接进入 plan。
2. **Given** 代码库或文档可以回答需求问题，**When** Agent 准备访谈，**Then** Agent 先完成探索，仅向用户提交需要用户决定的独立问题。
3. **Given** 多个需求决策彼此独立，**When** Agent 组织访谈，**Then** 每批覆盖当前全部可独立回答的问题，并附推荐答案与理由。
4. **Given** 规格尚未获得当前完整版本的 `Approved` 或 `Waived`，**When** Agent 尝试制定计划，**Then** plan 停止并返回 clarify。
5. **Given** 计划尚未获得当前完整版本的 `Approved` 或 `Waived`，**When** Agent 尝试生成任务，**Then** tasks 停止并返回 plan。
6. **Given** 实现中出现新的未决项，**When** Agent 继续处理受影响工作，**Then** implement 暂停该工作并返回对应探索、访谈与审查环节。
7. **Given** 用户明确豁免访谈或审查，**When** 流程继续，**Then** 对应文档记录豁免范围、未确认事项与风险。

---

### User Story 2 - 保持流程文件与项目文档一致 (Priority: P1)

维护者查看 Spec Kit 模板、skill、集成清单和开发文档时，可以看到同一套阶段规则，并验证受管文件与清单记录一致。

**Why this priority**: 模板、执行指令与文档一致，才能让后续会话稳定执行相同流程。

**Independent Test**: 对照模板提交检查受管文件，审查项目文档中的阶段表，并核对集成清单中的文件摘要。

**Acceptance Scenarios**:

1. **Given** 五个核心 skill 与两个产物模板已同步，**When** 对照模板提交 `03c8e9e`，**Then** 对应文件内容与该提交一致。
2. **Given** 受管 skill 或模板已修改，**When** 检查 integration manifest，**Then** 每个被修改文件的 SHA-256 均与实际内容一致。
3. **Given** 维护者阅读开发流程表，**When** 检查 specify 到 implement 的步骤，**Then** 文档说明强制访谈、完整审查、阶段门禁与新未决项处理。
4. **Given** 本次同步完成，**When** 检查本仓库项目说明、插件文档结构与既有 worktree 扩展，**Then** 本仓库专有内容保持有效。

### Edge Cases

- 规格没有未决标记时仍需执行需求访谈。
- 用户只批准文档的一部分时，流程继续等待完整版本批准。
- 规格或计划在批准后发生实质修改时，原批准失效。
- 用户改变先前答案时，相关决策与受影响文档同步更新。
- 用户明确豁免后仍有未确认事项时，豁免记录列出全部事项与风险。
- 上游文件与本仓库项目说明存在差异时，仅同步流程规则并保留本仓库专有内容。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST 将 `speckit-specify`、`speckit-clarify`、`speckit-plan`、`speckit-tasks` 与 `speckit-implement` 的流程规则同步到模板提交 `03c8e9e`。
- **FR-002**: System MUST 让 specify 产出规格草稿与待确认决策，并固定进入 clarify。
- **FR-003**: System MUST 在需求访谈与实现细节访谈前完成对应探索，并按决策依赖分批确认当前全部独立问题。
- **FR-004**: System MUST 在规格与计划模板中提供状态、待确认决策、澄清记录和审查记录。
- **FR-005**: System MUST 仅在当前完整规格为 `Approved` 或 `Waived` 时允许计划，在当前完整计划为 `Approved` 或 `Waived` 时允许任务分解与实现。
- **FR-006**: System MUST 在文档发生实质修改后使既有批准失效，并在实现出现新未决项时暂停受影响工作。
- **FR-007**: System MUST 更新开发流程与 Spec Kit 维护说明，使阶段要求、受管文件摘要维护方式和文件地图与同步后的流程一致。
- **FR-008**: System MUST 更新两个 integration manifest 中全部受影响文件的 SHA-256。
- **FR-009**: System MUST 保留本仓库的项目说明、宪章、插件运行时代码、既有测试与 worktree 扩展行为。
- **FR-010**: System MUST 使用本仓库的功能规格记录本次同步，并保留本仓库的发布历史。

### Key Entities *(include if feature involves data)*

- **待确认决策**：包含稳定编号、问题、推荐答案、理由、依赖与状态的需求或实现选择。
- **审查记录**：包含日期、决定、适用版本、未确认事项与风险的完整文档审查结果。
- **流程状态**：`Draft`、`Approved` 或 `Waived`，决定后续阶段是否可以开始。
- **受管文件摘要**：integration manifest 记录的 SHA-256，用于核验 skill 与模板内容。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 在规格草稿没有未决标记的测试场景中，需求访谈触发率为 100%。
- **SC-002**: 在规格或计划未获当前完整版本批准或豁免的测试场景中，下游阶段启动次数为 0。
- **SC-003**: 测试访谈中的每批问题覆盖当时全部独立决策，每个问题都有推荐答案，依赖未答前置决策的问题提前出现次数为 0。
- **SC-004**: 五个核心 skill 与两个产物模板对模板提交 `03c8e9e` 的内容一致率为 100%。
- **SC-005**: 两个 integration manifest 中受影响文件的摘要不匹配数量为 0。
- **SC-006**: 仓库既有质量检查全部通过，插件运行时测试保持通过。

## Assumptions

- 同步来源为模板仓库提交 `03c8e9e459c2dc01ef296e35dc197789afad4eae`。
- 同步范围包括该提交中的五个核心 skill、两个产物模板、两个 integration manifest，以及开发流程和维护文档中的通用规则。
- 本仓库保留自身项目说明、功能规格、发布历史与插件专有文档。
- 本次变更只影响 Spec Kit 流程与文档，插件用户可见行为保持不变。
- 用户确认完全采用模板流程，并授权完成检查后创建与合并 PR。
