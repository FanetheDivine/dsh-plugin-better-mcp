---

description: "Task list for workspace-scoped MCP instances"

---

# Tasks: Workspace 级 MCP 实例

**Input**: Design documents from `/specs/025-workspace-mcp/`

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/、quickstart.md

**Tests**: 宪章要求代码与测试同步。各故事先写行为测试并确认失败，再实现。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 不同文件且无未完成依赖，可并行。
- **[Story]**: US1–US4 对应 spec 的四个用户故事。
- 每个 Phase 完成后运行质量检查并提交一个 commit。

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 对齐宿主版本并扩展测试设施

- [X] T001 将全部直接 `@deepseek-ai/dsh-*` 依赖升级为 `0.2.2-rc.5`，新增 working-directory、system-prompt、mcp-resources 同版本依赖并更新 `package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`
- [X] T002 扩展宿主模拟，支持 workingDirectory、完整 ToolDefinition、MCP Manager watch、resources、system prompt 与目录事件，修改 `tests/helpers.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 建立配置、命名、实例池与代理原语

**⚠️ CRITICAL**: 本阶段完成前不开始用户故事

- [X] T003 [P] 增加 `workspace: boolean` 严格校验、默认 `false`、仅 stdio 可为 true 且工作区级强制 lazy，修改 `src/config.ts` 与 `tests/config.test.ts`
- [X] T004 [P] 实现规范化工作区键、稳定内部实例名、section 名和普通公开代理名，新增 `src/workspace-names.ts` 与 `tests/workspace-names.test.ts`
- [X] T005 [P] 重构共享挂载以区分共享配置和工作区配置，并保持共享路径兼容，修改 `src/servers.ts` 与 `tests/servers.test.ts`
- [X] T006 实现 `(serverName, workspaceKey)` 实例池、串行创建、引用集合、配置 generation、Manager watch 关闭等待与结构化清理结果，新增 `src/workspace-pool.ts` 与 `tests/workspace-pool.test.ts`
- [X] T007 实现 Agent-local 代理定义、target 身份校验、execute/output/projectContent/finalizeContent 委托与差异同步，新增 `src/workspace-proxy.ts` 与 `tests/workspace-proxy.test.ts`

**Checkpoint**: 配置、实例池与代理原语通过独立单元测试

---

## Phase 3: User Story 1 - 按需连接每个工作区的独立实例 (Priority: P1) 🎯 MVP

**Goal**: active 才创建当前工作区实例，同工作区共享，不同工作区隔离并使用正确 cwd

**Independent Test**: 两个工作区 active 前无实例，active 后各有一个实例；同工作区两个 Agent 只创建一个进程

### Tests for User Story 1

- [X] T008 [P] [US1] 编写 active 前不连接、并发 active、cwd、状态路由和删除警告的失败测试，修改 `tests/workspace-pool.test.ts` 与 `tests/visibility.test.ts`
- [X] T009 [P] [US1] 编写同名公开代理、跨工作区工具/instructions/resources 隔离与图片投影的失败测试，修改 `tests/workspace-proxy.test.ts` 与新增 `tests/workspace-resources.test.ts`

### Implementation for User Story 1

- [X] T010 [US1] 实现 active 获取、cwd 覆盖、同工作区复用、当前工作区状态读取和 active 删除警告，修改 `src/workspace-pool.ts`、`src/tools.ts` 与新增 `src/workspace-notices.ts`
- [X] T011 [US1] 将工作区代理和内部工具 deny 合并进现有 lazy 可见性，保持普通公开工具名并校验 target 与绑定，修改 `src/visibility.ts` 与 `src/workspace-proxy.ts`
- [X] T012 [P] [US1] 实现 instructions 过滤和 Agent-local resource provider 转发、内部资源调用守卫，新增 `src/workspace-presentation.ts`、`src/workspace-resources.ts`
- [X] T013 [US1] 装配 Agent 创建、tools/change、system-prompt/assemble 与资源守卫，修改 `src/index.ts` 与 `tests/plugin.test.ts`

**Checkpoint**: US1 独立可用，提交 Phase 3 commit

---

## Phase 4: User Story 2 - inactive 断连并释放文件夹占用 (Priority: P2)

**Goal**: inactive 按 active 引用断连，目录切换和文件夹缺失触发关闭屏障与提醒

**Independent Test**: 单 Agent inactive 关闭；共享 active 保留并提醒；切换等待关闭后可删除旧目录；Agent 释放保留实例

### Tests for User Story 2

- [X] T014 [P] [US2] 编写 inactive、Turn 结束、共享 active、Agent 释放和 Turn 后提醒的失败测试，修改 `tests/workspace-pool.test.ts`、`tests/workspace-notices.test.ts` 与 `tests/visibility.test.ts`
- [X] T015 [P] [US2] 编写目录切换关闭屏障、切换后错误不回滚、缺失检测、清理超时与旧代理失效的失败测试，新增 `tests/workspace-bindings.test.ts`

### Implementation for User Story 2

- [X] T016 [US2] 实现 inactive 与 Turn 结束的 active 引用释放、无引用关闭、共享占用状态和 Agent 释放保留，修改 `src/workspace-pool.ts`、`src/visibility.ts` 与 `src/tools.ts`
- [X] T017 [US2] 实现 working-directory/access 提交后绑定切换、无绑定旧工作区全部关闭和 watch 等待，新增 `src/workspace-bindings.ts`
- [X] T018 [US2] 在下一步与 active 前检测目录缺失并关闭失效实例，修改 `src/workspace-bindings.ts`、`src/workspace-pool.ts` 与 `src/index.ts`
- [X] T019 [US2] 扩展 CatalogSource、投影、渲染与去重，持久化 active/inactive/共享占用/切换/缺失/清理失败提醒，修改 `src/catalog.ts`、`src/visibility.ts` 与 `src/workspace-notices.ts`
- [X] T020 [US2] 串联关闭结果、面板错误和提醒，确保提交后清理异常不改变新 cwd，修改 `src/index.ts` 与 `tests/plugin.test.ts`

**Checkpoint**: US2 独立可用，Windows 删除时序测试通过，提交 Phase 4 commit

---

## Phase 5: User Story 3 - 分组查看和重连工作区实例 (Priority: P3)

**Goal**: 连接情况按成功/失败分组折叠，支持搜索、全部重连和单工作区重连

**Independent Test**: 混合状态实例正确分组和筛选，单实例重连只影响目标，全部重连包括搜索隐藏实例

### Tests for User Story 3

- [X] T021 [P] [US3] 编写状态快照、全部/单实例重连参数与错误码的失败测试，修改 `tests/routes.test.ts` 与 `tests/servers.test.ts`
- [X] T022 [P] [US3] 编写工作区开关、隐藏 lazy、连接分组、折叠、搜索和重连按钮的失败测试，修改 `tests/client.test.ts`

### Implementation for User Story 3

- [X] T023 [US3] 扩展实例快照和重连路由，支持 `all: true`、workspace 参数、404 与参数冲突，修改 `src/servers.ts` 与 `src/routes.ts`
- [X] T024 [P] [US3] 实现工作区开关、问号帮助和 stdio 下隐藏 lazy，修改 `src/client/server-form.tsx` 与 `src/client/api.ts`
- [X] T025 [US3] 实现可折叠连接情况、成功/失败分组、路径搜索、全部重连与单实例重连，修改 `src/client/panel.tsx`
- [X] T026 [P] [US3] 增加全部中英文面板与提醒文案，修改 `src/client/locales.ts`

**Checkpoint**: US3 独立可用，提交 Phase 5 commit

---

## Phase 6: User Story 4 - 现有共享型 MCP 保持可用 (Priority: P4)

**Goal**: 未启用工作区级别的配置和 HTTP MCP 保持既有行为

**Independent Test**: 既有配置无需修改即可加载，shared lazy、OAuth、挂载、路由与面板回归通过

- [ ] T027 [P] [US4] 增加旧配置兼容、HTTP 不显示工作区开关、共享 lazy/OAuth/挂载回归测试，修改 `tests/config.test.ts`、`tests/client.test.ts` 与 `tests/plugin.test.ts`
- [ ] T028 [US4] 修复回归并完成三工作区各 20 次并行调用与单实例故障隔离集成测试，修改 `src/index.ts` 与 `tests/plugin.test.ts`

**Checkpoint**: 四个用户故事全部通过，提交 Phase 6 commit

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 文档、全量质量门禁和真实宿主验收

- [ ] T029 [P] 更新用户功能与工作区 YAML 配置说明，修改 `README.md` 与 `docs/configuration.md`
- [ ] T030 [P] 更新实例池、代理、生命周期、提醒、风险、测试和文件地图，修改 `docs/how-it-works.md`、`docs/known-risks.md` 与 `docs/development.md`
- [ ] T031 运行 `pnpm format && pnpm full-check` 并修复全部问题，核对 `tests/package-pack.test.ts` 与构建产物新鲜度
- [ ] T032 按 `specs/025-workspace-mcp/quickstart.md` 完成 rc.5 实机验证，覆盖 Serena、并行、inactive、共享占用、Windows 删除、resources、搜索与重连
- [ ] T033 审查最终 diff、任务完成度和公开引用，更新 `CHANGELOG.md` 并准备交付

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup → Foundational → US1 → US2 → US3 → US4 → Polish。
- 每个 Phase 一个 commit；后续 Phase 依赖前一 Phase 的 checkpoint。
- US3 的宿主 API 可在 US2 实例状态稳定后开发，客户端表单任务 T024 与文案任务 T026 可并行。

### Story Dependencies

- **US1**: 依赖 Foundational，提供按需实例和隔离代理 MVP。
- **US2**: 复用 US1 实例池与代理，增加断连、关闭屏障和提醒。
- **US3**: 复用 US1/US2 状态，独立增加管理能力。
- **US4**: 对全部故事做兼容与并行回归。

### Parallel Opportunities

- T003、T004、T005 可并行。
- US1 的测试 T008、T009 可并行；实现 T012 可与 T010/T011 的不同文件部分并行。
- US2 的测试 T014、T015 可并行。
- US3 的测试 T021、T022 可并行；T024、T026 可并行。
- 文档任务 T029、T030 可并行。

## Parallel Example: User Story 1

```text
Task T008: active 与共享池行为测试
Task T009: 代理、资源与提示隔离测试
```

## Parallel Example: User Story 3

```text
Task T021: 面板 API 与重连测试
Task T022: 客户端分组、搜索与表单测试
```

## Implementation Strategy

### MVP First

1. 完成 Setup 与 Foundational。
2. 完成 US1，验证 active 才启动、cwd 正确、同工作区共享和跨工作区隔离。
3. US1 通过后再实现生命周期和管理界面。

### Incremental Delivery

1. US1 提供核心并行能力。
2. US2 提供可预测的关闭、删除与提醒。
3. US3 提供多工作区管理。
4. US4 与 Polish 保证兼容、文档和实机质量。

## Notes

- 所有测试任务先确认新增用例失败，再进入对应实现。
- 每个 Phase 完成后运行 `pnpm format && pnpm check` 并提交。
- Phase 7 运行 `pnpm full-check` 与真实宿主验证。
- 遇到新未决需求时暂停受影响任务并返回对应 Spec Kit 阶段。
