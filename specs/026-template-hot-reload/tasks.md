---
description: "Task list for migrating the template hot-reload skill and frontend link rule"

---

# Tasks: 迁移模板的实机热更新与前端链接规则

**Input**: Design documents from `specs/026-template-hot-reload/`

**Prerequisites**: [plan.md](./plan.md)、[spec.md](./spec.md)、[requirements.md](./checklists/requirements.md)

**Tests**: 不改插件源码与单元测试；脚本行为由一轮实机回归验证，结论写入 `real-device-report.md`。

**Organization**: 任务按文件职责分阶段，每个阶段检查后形成一个提交。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行
- **[US1]**: 在同一运行实例中迭代实机验证
- **[US2]**: 按 skill 走完一轮实机测试
- **[US3]**: 开发文档写明前端 UI 链接规则
- 所有路径均相对于仓库根目录

## Phase 1: 建立设计基线

**Purpose**: 保存规格、计划与任务清单。

- [x] T001 检查 [spec.md](./spec.md)、[plan.md](./plan.md)、[tasks.md](./tasks.md)、[requirements.md](./checklists/requirements.md) 的一致性并提交

**阶段提交**：`docs(026): 记录模板热更新迁移设计`

---

## Phase 2: US1 - 链接安装与 HMR 补丁

**Goal**: 实机 profile 以链接方式加载仓库 `dist`，并监听产物变化。

**Independent Test**: 运行 `setup-env.sh` 后，profile 的 `package.json` 含 `link:` 依赖，`cordis.patch.yml` 含指向 `<repo>/dist` 的 `hmr` 条目。

- [x] T002 [US1] 修改 `.dsh/skills/real-device-test/scripts/setup-env.sh`：第 4 步改为 `dsh plugin add "$REPO"` 并删除 `pnpm pack`；第 5 步补 `hmr` 条目，复用 profile 时补齐并去掉孤立 `[]`；结尾提示补「构建后自动生效」与「结束删除 profile」

**阶段提交**：`feat(026): 实机 profile 改为链接安装并启用 HMR`

---

## Phase 3: US2 - skill 迭代流程与排错

**Goal**: skill 给出「改代码 → 构建 → 观察 → 重跑用例」流程、每轮清理与热更新排错。

**Independent Test**: 按 skill 执行一轮，步骤中不含重装与重启；排错表覆盖构建后无变化、点目录被忽略、加载旧产物、前端未更新、补丁手工改动。

- [x] T003 [P] [US2] 更新 `.dsh/skills/real-device-test/SKILL.md`：阶段 0 说明构建是迭代动作；阶段 1 改为链接安装与 HMR 补丁；新增「在同一实例中迭代」小节与一次热更新验证步骤；阶段 5 改为先存报告截图再删除 profile；A1 文案同步
- [x] T004 [P] [US2] 更新 `.dsh/skills/real-device-test/references/pitfalls.md`：新增「热更新」排错表
- [x] T005 [P] [US2] 更新 `.dsh/skills/real-device-test/references/cases.md`：新增热更新验证步骤，报告结构增加「热更新验证」一节
- [x] T006 [US2] 修改 `.dsh/skills/real-device-test/scripts/run-test.mjs`：A1 提示文案从「已安装」改为「加载」

**阶段提交**：`docs(026): skill 补充链接安装与热更新流程`

---

## Phase 4: US3 - 前端 UI 链接规则

**Goal**: 开发文档写明前端 `a` 标签使用完整 URL 的要求与原因。

**Independent Test**: 打开 `docs/development.md` 的「前端构建」之后，读到「前端 UI 链接」小节。

- [x] T007 [P] [US3] 在 `docs/development.md` 的「前端构建」后新增「前端 UI 链接」小节
- [x] T008 [US3] 在 `CHANGELOG.md` 的 `## Unreleased` 下记录热更新与前端链接两条变更

**阶段提交**：`docs(026): 开发文档要求前端 UI 链接使用完整 URL`

---

## Phase 5: US1 - 实机回归与交付

**Goal**: 在真实宿主上验证链接安装、HMR 与轮次清理。

- [x] T009 [US1] 按 [plan.md](./plan.md) 完成一轮实机回归：搭建 profile、运行后端用例、在 GUI 中改工具说明并构建、确认进程号不变
- [x] T010 [US1] 写 `specs/026-template-hot-reload/real-device-report.md`，复制留证截图到 `.rdt-shots/`，删除 profile
- [ ] T011 运行 `pnpm format && pnpm check`，审查完整 diff 后推送分支并创建 PR

**阶段提交**：`docs(026): 完成实机热更新回归`

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5。
- Phase 5 依赖前四个阶段的文件修改完成。

## Parallel Opportunities

- T003、T004、T005 修改不同文档。
- T007 与 T003 至 T006 无依赖。

## Notes

- 模板的 `src/demo-tool.ts` 在本项目对应 `src/tools.ts` 的 `mcp_manage` 说明。
- 保留本项目专有用例脚本、`RDT_PLUGIN_CONFIG` 与中文界面断言。
