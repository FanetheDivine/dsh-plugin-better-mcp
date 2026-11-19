---

description: "Task list for syncing the Spec Kit interview and review workflow"

---

# Tasks: 同步 Spec Kit 访谈与审查流程

**Input**: Design documents from `specs/023-sync-spec-workflow/`

**Prerequisites**: [plan.md](./plan.md)（必需）、[spec.md](./spec.md)（用户故事）、[research.md](./research.md)、[data-model.md](./data-model.md)、[contracts/](./contracts/)、[quickstart.md](./quickstart.md)

**Tests**: 本次仅修改流程文档与受管文件，沿用仓库既有质量检查，不新增测试文件。

**Organization**: 任务按文件职责和流程门禁分阶段，每个阶段检查后形成一个提交。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行，任务修改不同文件且没有彼此依赖
- **[US1]**: 使用完整访谈与审查流程
- **[US2]**: 保持流程文件与项目文档一致
- 所有路径均相对于仓库根目录

## Path Conventions

- 单仓库文档结构：仓库根目录、`.dsh/skills/`、`.specify/`、`AGENTS.md`、`docs/`
- 本功能文档：`specs/023-sync-spec-workflow/`

## Phase 1: 建立设计基线

**Purpose**: 保存已确认的规格、计划、研究、数据模型、流程契约、验证指南和任务清单。

- [x] T001 检查 [spec.md](./spec.md)、[plan.md](./plan.md)、[research.md](./research.md)、[data-model.md](./data-model.md)、[workflow.md](./contracts/workflow.md)、[quickstart.md](./quickstart.md)、[requirements.md](./checklists/requirements.md) 与本文件的一致性，并提交 `specs/023-sync-spec-workflow/`

**阶段提交**：`docs(023): 记录 Spec Kit 同步设计`

---

## Phase 2: 建立统一文档区块

**Purpose**: 让规格与计划提供状态、待确认决策、澄清记录和审查记录。

**Independent Test**: 两个模板包含四类区块，原执行步骤保持不变。

- [x] T002 [P] [US2] 将 `.specify/templates/spec-template.md` 同步到模板提交 `03c8e9e`，增加 `Draft`、`Approved`、`Waived` 状态说明以及三个记录区块
- [x] T003 [P] [US2] 将 `.specify/templates/plan-template.md` 同步到模板提交 `03c8e9e`，保留技术背景、宪章检查和项目结构并增加三个记录区块

**Checkpoint**: 两个模板与模板提交一致。

---

## Phase 3: US1 - 探索后的分批访谈

**Goal**: specify 固定进入必经的 clarify，两段访谈都在探索后按依赖批量确认全部独立决策。

**Independent Test**: 无未决标记的规格仍进入需求访谈；批次覆盖全部可独立问题，依赖未满足的问题延后。

- [x] T004 [P] [US1] 将 `.dsh/skills/speckit-specify/SKILL.md` 同步到模板提交 `03c8e9e`，保留 front matter 与创建流程，固定进入 clarify
- [x] T005 [P] [US1] 将 `.dsh/skills/speckit-clarify/SKILL.md` 同步到模板提交 `03c8e9e`，落实探索前置、稳定编号、依赖分批、推荐答案和部分回答处理

**Checkpoint**: 需求访谈阶段可跨会话恢复，未答复项保持可见。

---

## Phase 4: US1 - 完整规格批准门禁

**Goal**: 当前完整规格达到 `Approved` 或 `Waived` 后允许制定计划。

**Independent Test**: 未批准、部分认可、实质修改或无豁免时，plan 停在规格门禁。

- [x] T006 [US1] 审查 `.dsh/skills/speckit-clarify/SKILL.md`，确认访谈写回后请求完整规格审查，并维护审查记录、豁免风险与批准失效
- [x] T007 [P] [US1] 将 `.dsh/skills/speckit-plan/SKILL.md` 同步到模板提交 `03c8e9e`，在 setup 前执行规格门禁

**Checkpoint**: 规格审查通过前 plan 不创建设计产物。

---

## Phase 5: US1 - 实现访谈与完整计划门禁

**Goal**: 技术探索后确认实现细节，当前完整计划达到 `Approved` 或 `Waived` 后允许任务与实现。

**Independent Test**: 计划未批准或未豁免时 tasks 不运行 setup；实现出现新未决项时暂停受影响工作。

- [x] T008 [US1] 审查 `.dsh/skills/speckit-plan/SKILL.md`，确认技术探索后的实现决策清单、分批访谈、计划审查和状态失效规则
- [x] T009 [P] [US1] 将 `.dsh/skills/speckit-tasks/SKILL.md` 同步到模板提交 `03c8e9e`，在 setup 前核验规格与计划门禁
- [x] T010 [P] [US1] 将 `.dsh/skills/speckit-implement/SKILL.md` 同步到模板提交 `03c8e9e`，实现前复核门禁并处理新未决项

**Checkpoint**: 任务与实现只接收已批准或已豁免的完整规格和计划。

---

## Phase 6: US2 - 项目文档与受管清单

**Goal**: 主流程入口、维护说明和文件清单准确反映同步后的流程。

**Independent Test**: `AGENTS.md` 与 `docs/development.md` 包含通用流程规则，九个受管文件的摘要与实际内容一致。

- [ ] T011 [P] [US2] 更新 `AGENTS.md` 的开发流程表，写明 specify、clarify、plan、tasks、implement 的访谈、审查和未决项门禁
- [ ] T012 [P] [US2] 更新 `docs/development.md` 的 Spec Kit 流程、纯文档质量要求、核心流程维护说明与文件地图，保留本仓库专有测试和实机验证内容
- [ ] T013 [US2] 更新 `.specify/integrations/dsh.manifest.json` 与 `.specify/integrations/speckit.manifest.json` 中五个 skill、两个模板的 SHA-256

**Checkpoint**: 仓库内流程说明与受管文件保持一致。

---

## Phase 7: 最终验证与交付准备

**Purpose**: 验证文件一致性、流程行为与仓库质量门禁。

- [ ] T014 [US2] 按 [quickstart.md](./quickstart.md) 审查完整 diff，并运行 `git diff --check`、`pnpm format && pnpm check` 与 `pnpm run full-check`

**阶段提交**：`docs(023): 同步 Spec Kit 访谈与审查流程`

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7。
- Phase 2 的模板区块是 Phase 4 和 Phase 5 审查记录规则的文档基础。
- Phase 4 依赖 Phase 3 的 clarify 行为。
- Phase 5 依赖 Phase 4 的 plan 行为。
- Phase 6 依赖五个核心 skill 与两个模板的最终内容。
- Phase 7 依赖全部文件修改完成。

## Parallel Opportunities

- T002 与 T003 修改不同模板。
- T004 与 T005 修改不同 skill。
- T007 可与 T006 的审查结论并行准备，但 plan 最终编辑依赖 clarify 审查通过。
- T009 与 T010 修改不同 skill。
- T011 与 T012 修改不同文档。

## Implementation Strategy

1. 先提交已确认设计。
2. 建立 spec/plan 统一区块。
3. 依次完成需求访谈、规格门禁和计划门禁。
4. 最后同步项目文档与 manifest。
5. 运行最终验证，按用户授权进入 PR 合并流程。

## Notes

- 五个核心 skill 和两个模板直接采用模板提交 `03c8e9e` 的内容。
- `AGENTS.md` 与 `docs/development.md` 应用通用流程差异，保留本仓库专有内容。
- 每个阶段任务标记 `[x]`，该阶段检查通过后提交。
