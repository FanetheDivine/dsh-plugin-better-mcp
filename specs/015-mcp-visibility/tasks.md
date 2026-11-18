# Tasks: 按会话管理 MCP 可见性

**Input**: `specs/015-mcp-visibility/` 下的设计文档

**Prerequisites**: [plan.md](./plan.md)、[spec.md](./spec.md)、[research.md](./research.md)、[data-model.md](./data-model.md)、[contracts/](./contracts/)

**Tests**: 宪章原则 II 要求代码变更同步测试，每个阶段包含测试任务。

**Commit**: 每个阶段一个 commit。

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [x] T001 在 package.json 新增 devDependencies `@deepseek-ai/dsh-session-projection`、`@deepseek-ai/dsh-session`、`@deepseek-ai/dsh-llm`，版本 `0.2.2-rc.3`；删除 `@deepseek-ai/dsh-home-paths`；同步 pnpm-workspace.yaml 的 `minimumReleaseAgeExclude`；运行 `pnpm install` 更新 pnpm-lock.yaml

---

## Phase 2: User Story 4 - 移除工具聚合端点 (Priority: P1)

**Goal**: 删除聚合端点、端点令牌、`expose`、`mcp_call`、`mcp_servers`。

**Independent Test**: 插件只注册 OAuth 回调一条 Web 路由；配置含 `expose` 时报未知键；工具表没有 `mcp_call` 与 `mcp_servers`。

- [x] T002 [US4] 删除 src/aggregate.ts 与 tests/aggregate.test.ts
- [x] T003 [US4] 在 src/config.ts 删除 `expose` schema、`ExposeConfig`、`ToolGroup`、`normalizeExpose`，`CONFIG_KEYS` 只保留 `servers`
- [x] T004 [US4] 在 src/constants.ts 删除 `ENDPOINT_DEFAULT`、`TOKEN_REF`、`MAX_BATCH`、`AGGREGATE_CALL_TIMEOUT_MS`、`DEFAULT_GROUP`；在 src/credentials.ts 删除 `ensureEndpointToken`、`rotateEndpointToken`
- [x] T005 [US4] 在 src/routes.ts 删除聚合路由、`/api/better-mcp/endpoint/rotate`、`syncAggregateRoute`、`handlerFor`；快照不再带令牌
- [x] T006 [US4] 在 src/servers.ts 删除 `PanelSnapshotWithToken`、`expose` 快照字段、`execute`、`publicToolName`、`waitConnected`
- [x] T007 [US4] 在 src/tools.ts 删除 `buildServerTool`、`buildCallTool`、`parseCallArgs`；在 src/index.ts 删除对应注册与 `syncAggregateRoute` 调用
- [x] T008 [US4] 在 src/client/api.ts 删除 `rotateEndpointToken` 与 `expose` 类型；在 src/client/panel.tsx 删除聚合端点区块、复制与令牌状态
- [x] T009 [US4] 在 cordis.patch.yml 删除 `expose`；在 src/utils.ts 删除仅聚合端点使用的 `globToRegExp`
- [x] T010 [US4] 更新 tests/config.test.ts、tests/routes.test.ts、tests/servers.test.ts、tests/plugin.test.ts、tests/credentials.test.ts、tests/client.test.ts、tests/helpers.ts，删除聚合与旧工具用例，新增「配置含 expose 报未知键」与「只有 OAuth 回调路由」用例

**Checkpoint**: `pnpm format && pnpm check` 通过后提交。

---

## Phase 3: User Story 3 - 配置服务器简介 (Priority: P2)

**Goal**: 服务器定义必须带简介。

**Independent Test**: 缺简介的配置与表单提交都被拒绝；快照返回简介。

- [x] T011 [US3] 在 src/config.ts 的 `ServerDefinition` 与 schema 新增 `description`，规则「必填，去掉首尾空白后非空」，缺失时抛 `servers.<name>.description is required`
- [x] T012 [US3] 在 src/servers.ts 构造管理器条目时去掉 `description`；`ServerRow` 新增 `description`
- [x] T013 [P] [US3] 在 src/client/server-form.tsx 新增简介字段（多行文本）、`descriptionRequired` 校验与 `definitionFromValues` 输出；在 src/client/locales.ts 新增 `description`、`descriptionRequired` 键
- [x] T014 [US3] 在 cordis.patch.yml 注释与 README.md 配置示例补 `description`
- [x] T015 [US3] 更新 tests/config.test.ts、tests/servers.test.ts、tests/client.test.ts、tests/routes.test.ts 的定义夹具并新增缺简介用例

**Checkpoint**: `pnpm format && pnpm check` 通过后提交。

---

## Phase 4: User Story 1 - 模型按会话控制 MCP 可见性 (Priority: P1)

**Goal**: 服务器全部挂载，`mcp_manage` 按会话切换工具可见性。

**Independent Test**: 两个模拟 Agent，一个激活懒加载服务器后其 deny 列表移除该服务器工具，另一个不变。

- [ ] T016 [US1] 删除 src/state.ts、src/home.ts、tests/state.test.ts；src/servers.ts 的 `isLazy` 改为只读定义的 `lazy`，启动与对账时挂载全部服务器，重连总是重新挂载
- [ ] T017 [US1] 在 src/routes.ts 把 `/api/better-mcp/lazy` 改为经 configEditor 写回 `servers.<name>.lazy`
- [ ] T018 [US1] 在 src/types.ts 引入 `Agent`、`SessionEvent`、`UserMessage` 类型与 `ctx.agents`、`ctx.sessionProjections`、`tools.restrict` 所需声明
- [ ] T019 [US1] 新建 src/visibility.ts：`VisibilityRuntime` 维护每个 Agent 的待定表与限制；`effective(agent)` 按「待定表 → projection → `!lazy`」计算；`sync(agent)` 计算 deny 列表（当前全局工具中前缀为 `mcp__<server>__` 且服务器不可见，按最长服务器名匹配），集合变化时替换 `agent.ctx.tools.restrict`；`syncAll()`；`dispose()` 解除全部限制
- [ ] T020 [US1] 在 src/visibility.ts 注册 projection `better-mcp-catalog`（宿主私有，`stateVersion: 1`，手写 `parse`），折叠目录消息的 `seq`、`digest`、`entries`、`overrides`
- [ ] T021 [US1] 在 src/tools.ts 实现 `buildManageTool`，按 contracts/mcp-manage.md 校验参数、写待定表、立即 `sync`，返回服务器名、可见性与连接状态
- [ ] T022 [US1] 在 src/index.ts 的 `ctx.inject(['agents', 'sessionProjections'])` 内创建 `VisibilityRuntime`，监听 `agent/created`、`tools/change`，启用时 `syncAll()`，对账后 `syncAll()`；`inject` 与 how-it-works 一致
- [ ] T023 [US1] 在 tests/helpers.ts 增加模拟 Agent（`ctx.tools.restrict`、`session.surface.nodes`、`session.seq`）、`ctx.agents`、`ctx.sessionProjections`；新建 tests/visibility.test.ts 覆盖 spec US1 验收场景 1–6

**Checkpoint**: `pnpm format && pnpm check` 通过后提交。

---

## Phase 5: User Story 2 - 会话内 MCP 目录提醒 (Priority: P1)

**Goal**: 每个会话至少有一条可见的目录消息，变化时写更新消息。

**Independent Test**: 模拟 pre-step：首次追加完整目录；无变化不追加；移出 surface 后补写；激活后追加更新消息。

- [ ] T024 [P] [US2] 新建 src/catalog.ts：`catalogEntries`、`catalogDigest`、`renderCatalog`、`renderCatalogUpdate`，文本与转义按 contracts/catalog-message.md；消息对象按 `UserMessage` 结构构造并冻结
- [ ] T025 [US2] 在 src/visibility.ts 监听 `agent/pre-step`：`next()` 之后按 research R4 决定不写、写完整目录或写更新消息；写入后清除已落入消息的待定项
- [ ] T026 [US2] 在 src/types.ts 用 `MessageSourceMap` 声明 `better-mcp-catalog` 来源
- [ ] T027 [US2] 新建 tests/catalog.test.ts 覆盖渲染与摘要；在 tests/visibility.test.ts 覆盖 spec US2 验收场景 1–7

**Checkpoint**: `pnpm format && pnpm check` 通过后提交。

---

## Phase 6: User Story 5 - 文案与面板修正 (Priority: P2)

**Goal**: 元数据与面板文案统一、可翻译，面板只提供能成功的操作。

**Independent Test**: tests/client.test.ts 与 tests/metadata.test.ts 断言新键集、描述与外部服务器无操作。

- [ ] T028 [P] [US5] locale/zh.json 描述改为「可视化地对MCP进行管理和鉴权；提供MCP懒加载能力」；locale/en.json 描述改为 `Visually manage and authorize MCP servers, with lazy loading.`；package.json `description` 与英文一致
- [ ] T029 [US5] 在 src/servers.ts 把状态改为结构化字段 `state`、`toolCount`、`connectedAt`、`attempt`、`maxAttempts`、`error`、`cleanup`，同步 src/client/api.ts 的 `ServerRow`
- [ ] T030 [US5] 在 src/client/locales.ts 删除未使用的键，新增状态、状态说明、工具数、刷新、认证方式选项的键；英文徽标与开关使用 sentence case；面板标题改为「MCP 服务器 / MCP servers」
- [ ] T031 [US5] 在 src/client/panel.tsx 删除品牌字、头部按钮改用 `refresh`、按字典格式化状态与工具数、外部服务器行不显示操作按钮
- [ ] T032 [US5] 在 src/client/server-form.tsx 认证方式选项改用字典
- [ ] T033 [US5] 更新 tests/client.test.ts、tests/metadata.test.ts

**Checkpoint**: `pnpm format && pnpm check` 通过后提交。

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T034 [P] 更新 README.md：功能、配置表、工具、面板、OAuth、限制；删除聚合端点章节
- [ ] T035 [P] 更新 docs/how-it-works.md：入口契约、宿主运行时、可见性、数据流、秘密存放
- [ ] T036 [P] 更新 docs/known-risks.md：删除聚合端点与客户端令牌；新增可见性风险（restrict 依赖、前缀匹配、待定选择在下一步前崩溃会丢失）
- [ ] T037 [P] 更新 docs/development.md 文件地图；更新 .dsh/skills/real-device-test 的用例与脚本，删除聚合端点用例，新增 `mcp_manage` 用例
- [ ] T038 运行 `pnpm format && pnpm check && pnpm build`

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7。
- US2 依赖 US1 的 projection 与运行时，依赖 US3 的简介。
- US5 的状态字段改动与 US4 的快照改动同文件，放在其后。

## Parallel Opportunities

- T013 与 T011–T012 不同文件。
- T024 与 T025 前的阶段工作无依赖。
- T028 与 Phase 6 其他任务不同文件。
- T034–T037 互不依赖。

## Implementation Strategy

1. 先完成 US4，减少后续改动面。
2. US3 提供目录所需的简介。
3. US1 与 US2 构成 MVP。
4. US5 与文档收尾。
