---
description: "MCP 状态与会话同步实施任务"
---

# Tasks: MCP 状态与会话同步

**Input**: Design documents from `specs/018-mcp-state-sync/`

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、quickstart.md

**Tests**: 宪章要求代码变更同步更新测试。每个故事先写行为测试并确认失败，再实施功能。

**Organization**: 按 P1、P2 用户故事组织。每个阶段对应一个 commit。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 不同文件且没有未完成依赖，可以并行。
- **[Story]**: US1 为弹窗状态刷新，US2 为会话目录注入。
- 所有路径均相对仓库根目录。

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 建立已评审的规格、计划与验证基线。

- [X] T001 提交规格、计划、研究与验证产物，包括 `.gitignore` 和 `specs/018-mcp-state-sync/`；`.specify/feature.json` 沿用现有本地忽略规则

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 让模拟 Agent 支持宿主的真实待处理队列与注入行为。

- [X] T002 在 `tests/helpers.ts` 为 FakeAgent 增加 `inbox.nextStep`、`inject()` 与队列观测能力，保持现有 `ctx` 模拟契约

**Checkpoint**: 现有测试在纯测试设施变更后继续通过。

---

## Phase 3: User Story 1 - 弹窗持续显示连接结果 (Priority: P1) 🎯 MVP

**Goal**: 面板打开期间自动呈现连接成功、失败与重连状态。

**Independent Test**: 用虚拟计时器和延迟响应驱动面板刷新，保持面板挂载即可观察到最新状态。

### Tests for User Story 1

- [X] T003 [US1] 在 `tests/client.test.ts` 增加立即读取、1 秒串行刷新、慢请求不重叠、失败后续刷新与卸载清理测试，并确认新增测试失败

### Implementation for User Story 1

- [X] T004 [US1] 在 `src/client/panel.tsx` 实现串行状态轮询、最新快照序号和卸载失效处理，接入手动刷新与表单结果
- [X] T005 [US1] 运行 `tests/client.test.ts` 与相关源码测试，验证弹窗和配置页共享面板的刷新行为

**Checkpoint**: 用户保持弹窗打开即可看到最终连接状态，US1 可以独立交付。

---

## Phase 4: User Story 2 - 会话及时获知 MCP 变化 (Priority: P2)

**Goal**: 配置与可见性变化生效后，受影响会话立即获得最新 system-reminder 目录。

**Independent Test**: 使用两个模拟 Agent 修改配置和可见性，检查各自待处理队列与下一步提交的消息。

### Tests for User Story 2

- [ ] T006 [US2] 在 `tests/visibility.test.ts` 增加配置变化广播、可见性隔离、立即注入、无变化去重、空目录与连续变化合并测试，并更新 `step()` 模拟队列准入，确认新增测试失败

### Implementation for User Story 2

- [ ] T007 [US2] 在 `src/visibility.ts` 实现单会话与全体会话目录注入、待处理目录去重和无操作变化短路，复用现有目录消息
- [ ] T008 [US2] 在 `src/index.ts` 于配置对账后触发全量注入，并在 `agent/pre-step` 合并旧目录为至多一条最新目录
- [ ] T009 [US2] 运行 `tests/visibility.test.ts`、`tests/plugin.test.ts` 与 `tests/catalog.test.ts`，验证消息持久化时机和现有恢复行为

**Checkpoint**: 在线会话在变化后持有最新目录，后续步骤只提交一条最新目录。

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: 同步用户文档、机制说明与完整质量门禁。

- [ ] T010 [P] 更新 `README.md` 的面板自动刷新和变化后立即注入提醒行为
- [ ] T011 [P] 更新 `docs/how-it-works.md` 的目录消息时机、数据流与面板刷新机制
- [ ] T012 [P] 更新 `docs/known-risks.md` 的注入持久化、取消与空闲会话边界
- [ ] T013 按 `specs/018-mcp-state-sync/quickstart.md` 运行 `pnpm format && pnpm check`、`pnpm full-check` 和真实宿主验证

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup**: 无依赖，对应规格与计划 commit。
- **Foundational**: 依赖 Setup，对应模拟队列设施 commit。
- **US1**: 依赖 Foundational，对应面板刷新 commit。
- **US2**: 依赖 Foundational；在 US1 后实施，对应会话注入 commit。
- **Polish**: 依赖 US1 与 US2，对应文档和验证结果 commit。

### User Story Dependencies

- **US1**: 只修改共享面板及其测试，可独立验证。
- **US2**: 只修改宿主目录流程及其测试，可独立验证；不依赖 US1 的运行行为。

### Within Each User Story

- 先编写测试并确认失败。
- 再实现功能并运行故事级测试。
- 每个阶段完成后提交一个 commit。

### Parallel Opportunities

- T003 与 T006 使用不同测试文件，可在 T002 后并行准备。
- T010、T011、T012 使用不同文档，可以并行。
- T007 与 T008 有调用契约依赖，按顺序执行。

---

## Parallel Example: User Story 1 与 User Story 2

```text
T003: 编写 tests/client.test.ts 的轮询测试
T006: 编写 tests/visibility.test.ts 的注入测试
```

## Parallel Example: Polish

```text
T010: 更新 README.md
T011: 更新 docs/how-it-works.md
T012: 更新 docs/known-risks.md
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成规格与模拟设施。
2. 完成 US1 的轮询、顺序保证和卸载清理。
3. 独立运行面板测试并验证真实连接状态。

### Incremental Delivery

1. 交付 US1，解决弹窗状态停滞。
2. 交付 US2，让在线会话及时获得最新目录。
3. 更新文档并运行完整检查与实机验证。

## Notes

- 不新增依赖、路由、消息来源或会话事件类型。
- 连续变化允许在尚未准入的队列中合并，最终目录保持最新。
- 真实宿主验证按 `real-device-test` skill 执行。
