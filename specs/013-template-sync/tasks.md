# Tasks: 同步模板的元数据国际化规范与产物测试新鲜度

**Input**: `specs/013-template-sync/` 下的 spec、plan、research、data-model、contracts、quickstart

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/、quickstart.md

**Tests**: 宪章原则 IV 要求代码变更同步测试。产物新鲜度先写测试再接实现；元数据测试直接覆盖现有资源。

**Organization**: 每个阶段对应一个 commit。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件，无未完成依赖）
- **[Story]**: 所属用户故事（US1、US2、US3）

## Path Conventions

单包布局：`src/`、`tests/`、`docs/`、`locale/` 位于仓库根目录。

---

## Phase 1: 共享产物新鲜度检查

**Purpose**: 两个产物测试共用的判定模块。

- [X] T001 [P] 新建 `tests/dist-freshness.test.ts`，在系统临时目录构造输入与产物，覆盖新鲜、过期、全部缺失、部分缺失四种状态，断言错误信息含 `pnpm build` 与对应路径
- [X] T002 新建 `tests/support/dist-freshness.ts`，定义构建输入（固定文件：`tsdown.config.ts`、`tsconfig.json`、`tsconfig.build.json`、`package.json`；目录：`src/`）、产物清单（`dist/index.mjs`、`dist/client.js`、`dist/index.d.ts`、`dist/client/index.d.ts`）与 `assertFreshDist(root)`，失败信息三行并提示 `pnpm build`
- [X] T003 运行 `pnpm exec vitest run tests/dist-freshness.test.ts`，确认由失败转为通过；提交阶段 1

**Checkpoint**: `assertFreshDist` 可用，两个产物测试可接入

---

## Phase 2: User Story 1 - 产物测试与构建流程分开运行 (Priority: P1) 🎯 MVP

**Goal**: `test:code` 不读 `dist`，`test:dist` 在产物过期时明确失败，`build` 末尾运行 `test:dist`，`check` 只跑源码测试。

**Independent Test**: 无 `dist` 时 `pnpm check` 通过、`pnpm test:dist` 给出构建提示；`pnpm build` 重建产物并运行产物测试；`touch src/index.ts` 后 `pnpm test:dist` 报告过期。

### Tests for User Story 1

- [ ] T004 [P] [US1] 在 `tests/client-bundle.test.ts` 删除 `readBundle()` 中的条件构建，改为读取产物前调用 `assertFreshDist()`，保留现有断言
- [ ] T005 [P] [US1] 在 `tests/package-pack.test.ts` 删除 `packedPaths()` 中的条件构建，改为调用 `assertFreshDist()`，保留 tarball 断言

### Implementation for User Story 1

- [ ] T006 [P] [US1] 在 `vitest.config.ts` 用 `test.projects` 声明 `code`（含 `tests/**/*.test.ts` 与 `tests/**/*.test.mjs`，排除两个产物测试）与 `dist`（只含 `tests/client-bundle.test.ts` 与 `tests/package-pack.test.ts`），均 `extends: true`，保留 primitives alias 与 `worktrees/` 排除
- [ ] T007 [US1] 在 `package.json` 删除 `test`，新增 `test:code`（`vitest run --project code`）与 `test:dist`（`vitest run --project dist`），`check` 末项改为 `test:code`，`build` 末尾追加 `&& pnpm run test:dist`
- [ ] T008 [US1] 更新 `docs/development.md` 的命令表：`build` 说明末尾跑 `test:dist`，`check` 只跑 `test:code`，移除 `test`，补一行门禁说明
- [ ] T009 [US1] 更新 `.github/workflows/ci.yml` 的 `check` job 名称，体现 `test:code` 与产物测试随构建执行
- [ ] T010 [US1] 运行验证：删除 `dist` 后 `pnpm test:code` 通过、`pnpm test:dist` 失败并含 `pnpm build`；`pnpm build` 一次通过；`touch src/index.ts` 后 `pnpm test:dist` 报告过期；恢复后 `pnpm check` 在无 `dist` 时通过；提交阶段 2

**Checkpoint**: US1 完成，`check` 与 `build` 各自可独立验证

---

## Phase 3: User Story 2 - 元数据国际化规范落地 (Priority: P2)

**Goal**: 元数据结构、键集、禁用字符与打包声明由测试守住；规范单归属 `docs/i18n.md`；宪章新增国际化原则。

**Independent Test**: 删除 `locale/en.json`、改错 `meta` 键名、插入零宽空格或删除 `exports` 声明后，元数据测试失败并指出问题。

### Tests for User Story 2

- [ ] T011 [US2] 新增 `tests/metadata.test.ts`：目录只含基线 `en`、`zh`；每份 `meta` 恰含 `title` 与 `description` 且为非空字符串、标题单行；各语言键集一致；不含 U+200B 与 U+FEFF；声明 `meta.detail` 时匹配 `^docs/.+\.md$` 且文件存在；`package.json` 的 `exports` 含 `./locale/*.json`、`files` 含 `locale/*.json`
- [ ] T012 [US2] 运行 `pnpm exec vitest run tests/metadata.test.ts`，确认现有资源通过；逐项破坏后确认失败并指出破坏点

### Implementation for User Story 2

- [ ] T013 [P] [US2] 新增 `docs/i18n.md`：资源位置、`meta` 字段表（含可选 `detail`）、宿主回退顺序、包清单声明、前端字典与 `better-mcp` 命名空间、新增语言步骤、校验命令；约束条目指向宪章原则 VIII
- [ ] T014 [US2] 用 `/speckit-constitution` 在 `.specify/memory/constitution.md` 新增原则 VIII「国际化」：文案经字典或元数据提供、基线 `zh` 与 `en` 键集一致、元数据放 `locale/<语言 id>.json` 并在 `exports` 与 `files` 声明、译文保留占位符与 API 字段名、资源不含 U+200B 与 U+FEFF、变更由测试覆盖、规范归属 `docs/i18n.md`；同步影响报告记录 2.0.0 → 2.1.0
- [ ] T015 [P] [US2] 更新 `AGENTS.md` 文档索引，增加 `docs/i18n.md` 一行
- [ ] T016 [P] [US2] 更新 `README.md`，说明插件标题与描述随宿主语言切换，中英文各一份
- [ ] T017 [US2] 更新 `docs/development.md` 的测试表：两个产物测试标注「产物测试」，新增 `metadata.test.ts` 与 `dist-freshness.test.ts` 两行；补 vitest 两个 project 与新鲜度要求的说明；文件地图补 `tests/support/dist-freshness.ts` 与 `locale/` 条目
- [ ] T018 [P] [US2] 在 `docs/how-it-works.md` 的 locale 小节与打包小节补指向 `docs/i18n.md` 的链接与 `locale/*.json` 说明，不复制规则
- [ ] T019 [P] [US2] 在 `docs/known-risks.md` 增加「国际化」小节：注册时捕获的文案保持旧语言、回退链取值、缺元数据回落 `package.json`，并链接规范
- [ ] T020 [US2] 运行 `pnpm format && pnpm check`，提交阶段 3

**Checkpoint**: 元数据规范与测试落地，文档索引可查到

---

## Phase 4: User Story 3 - 文档与变更记录收尾 (Priority: P3)

**Goal**: CHANGELOG、文档索引与命令入口一致，无遗留旧命令。

**Independent Test**: 全仓库搜索 `pnpm test` 只命中旧版本归档；CHANGELOG 的 Unreleased 记录本次变更；按 quickstart 逐条通过。

- [ ] T021 [US3] 在 `CHANGELOG.md` 的 Unreleased 增加条目：测试入口拆分与产物过期提示、元数据测试与 `docs/i18n.md`、宪章 2.1.0
- [ ] T022 [US3] 检查 `AGENTS.md`、`docs/development.md`、`README.md` 与 `CHANGELOG.md` 的命令与链接一致，确认无 `pnpm test` 残留
- [ ] T023 [US3] 运行 `pnpm format && pnpm check && pnpm build`，按 `quickstart.md` 逐条验证；按宪章原则 VII 检查新增与修改的跟踪文件只引用仓库内路径与公网 URL；提交阶段 4

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: 无依赖，先完成
- **Phase 2 (US1)**: 依赖 Phase 1 的 `assertFreshDist`
- **Phase 3 (US2)**: 文档引用 Phase 2 的命令名；与 Phase 2 无文件冲突，按提交顺序在后
- **Phase 4 (US3)**: 依赖 Phase 2 与 Phase 3 的最终文本

### Within Each User Story

- 产物测试先接入判定，再改脚本，最后验证
- `vitest.config.ts` 的 project 名与 `package.json` 脚本名一致
- 文档只放链接，规范正文单归属 `docs/i18n.md`
- 验证命令全部通过后提交该阶段

### Parallel Opportunities

- T001/T002 与 T004/T005 分属测试与接入，按 TDD 顺序串行；T004 与 T005 可并行
- T006 与 T007 可并行（不同文件，但脚本改动需与 project 名一致）
- T013、T015、T016、T018、T019 可并行（不同文档）
- T017 与 T014 串行：宪章版本与测试表编号需一致

---

## Parallel Example: User Story 2

```bash
# 不同文档互不依赖，可同时修改
Task: "新增 docs/i18n.md 的国际化规范"
Task: "更新 AGENTS.md 文档索引"
Task: "更新 README.md 的语言切换说明"
Task: "更新 known-risks.md 的国际化风险"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1：新鲜度判定模块与测试
2. 完成 Phase 2：脚本拆分、两个产物测试接入、验证
3. 停止并独立验证：干净检出 `pnpm check`、`pnpm build`、过期场景提示

### Incremental Delivery

1. Phase 1 提交后判定模块可复用
2. Phase 2 提交后默认回归入口不再依赖产物
3. Phase 3 提交后元数据与国际化规范由测试与文档守住
4. Phase 4 提交后变更记录与文档一致

---

## Notes

- 每个阶段对应一个 commit
- 产物过期是显式失败，测试不写 `dist`
- `build` 是产物测试的唯一构建入口
- 运行时代码与元数据文件内容不改动
- 提交前运行 `pnpm format && pnpm check`