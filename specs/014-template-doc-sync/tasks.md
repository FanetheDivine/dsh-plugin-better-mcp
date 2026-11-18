# Tasks: 同步模板的宪章与主工作区规范

**Input**: Design documents from `/specs/014-template-doc-sync/`

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、quickstart.md

**Tests**: 本次只改文档。运行现有质量门禁与 quickstart 核对，不新增测试任务。

**Organization**: 按三个用户故事组织，每个阶段形成一个 commit。

## Phase 1: Setup

**Purpose**: 确认规格、计划与验证路径完整

- [X] T001 核对 `specs/014-template-doc-sync/` 的 spec、checklist、plan、research、data-model 与 quickstart，提交阶段 1

## Phase 2: Foundational

**Purpose**: 固定规则迁移与引用同步依据

- [X] T002 在 `specs/014-template-doc-sync/data-model.md` 补全原原则条款到归属文档的逐项映射
- [X] T003 核对 `specs/014-template-doc-sync/data-model.md` 覆盖原原则 I、II、III、VIII 的全部条款，提交阶段 2

## Phase 3: User Story 1 - Constitution Check 只核对硬约束 (Priority: P1) 🎯 MVP

**Goal**: 宪章只保留五条跨流程硬约束，版本为 3.0.0

**Independent Test**: 宪章原则顺序、版本与 Sync Impact Report 符合 spec 的 US1 验收场景

- [X] T004 [US1] 用 `/speckit-constitution` 修订 `.specify/memory/constitution.md`：保留五条原则，以 `@deepseek-ai/dsh-agent` 为 dsh 子包版本基准，记录迁移与重新编号
- [X] T005 [US1] 核对 `.specify/memory/constitution.md` 原则 II–V 保留本插件原有测试、文档、质量与公开引用条款，提交阶段 3

## Phase 4: User Story 2 - 移出的规则仍有唯一归属 (Priority: P1)

**Goal**: 宿主机制与国际化规则在归属文档中完整可查

**Independent Test**: 按 `specs/014-template-doc-sync/data-model.md` 的迁移表逐项核对，现行引用均有效

- [X] T006 [P] [US2] 更新 `docs/how-it-works.md`，承接宿主入口、严格配置与依赖归属规则
- [X] T007 [P] [US2] 更新 `docs/i18n.md`，承接原国际化原则的全部约束
- [X] T008 [US2] 更新 `docs/known-risks.md`，把版本规则链接到原则 I，把 external 规则链接到 `docs/how-it-works.md`
- [X] T009 [US2] 核对 `docs/how-it-works.md`、`docs/i18n.md` 与 `docs/known-risks.md` 的迁移完整性，提交阶段 4

## Phase 5: User Story 3 - 主工作区只用于同步 (Priority: P1)

**Goal**: 主工作区约束与创建前、清理后的同步步骤进入会话和流程说明

**Independent Test**: 只读 AGENTS 与四份流程说明，能列全约束、同步时机、停止条件与输出要求

- [X] T010 [P] [US3] 更新 `AGENTS.md`，增加主工作区定义、main 分支、干净状态、允许操作与 worktree 变更位置
- [X] T011 [P] [US3] 更新 `.specify/extensions/worktree/commands/speckit.worktree.create.md` 与 `.dsh/skills/speckit-worktree-create/SKILL.md`，增加创建前 Agent 同步与失败停止步骤
- [X] T012 [P] [US3] 更新 `.specify/extensions/worktree/commands/speckit.worktree.finish.md` 与 `.dsh/skills/speckit-worktree-finish/SKILL.md`，增加清理后 Agent 同步，并把 CHANGELOG 规则引用改为原则 III
- [X] T013 [US3] 更新 `docs/development.md` 的 Spec Kit 流程与测试原则编号，使其与流程说明一致
- [X] T014 [US3] 核对 `AGENTS.md`、两组 worktree 流程说明与 `docs/development.md` 一致，提交阶段 5

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 完成变更记录与整体验证

- [X] T015 [P] 更新 `CHANGELOG.md`，记录宪章 3.0.0、规则归属与主工作区流程
- [X] T016 按 `specs/014-template-doc-sync/quickstart.md` 核对全部验收点，运行 `pnpm format && pnpm check` 与 `git diff --check`
- [X] T017 检查 `git status --short` 与最终 diff，确认变更范围符合 `specs/014-template-doc-sync/spec.md`，提交阶段 6

## Dependencies & Execution Order

- Phase 1 → Phase 2 → US1 → US2 → US3 → Phase 6。
- US2 的 T006 与 T007 可并行；T008 在两者完成后执行。
- US3 的 T010、T011 与 T012 可并行；T013 在流程说明完成后执行。
- 每个阶段在提交后进入下一阶段。

## Parallel Example

```text
Task: "更新 docs/how-it-works.md"
Task: "更新 docs/i18n.md"

Task: "更新 AGENTS.md"
Task: "更新 worktree create 源命令与 skill"
Task: "更新 worktree finish 源命令与 skill"
```

## Implementation Strategy

1. 先完成五条宪章原则，形成可独立验收的 MVP。
2. 补齐归属文档，保证迁移规则完整。
3. 增加主工作区与同步流程约束。
4. 运行 quickstart 与现有质量门禁，检查最终范围。
