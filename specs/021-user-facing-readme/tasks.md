# Tasks: 面向用户的 README

**Input**: Design documents from `specs/021-user-facing-readme/`

**Prerequisites**: [plan.md](./plan.md)、[spec.md](./spec.md)、[research.md](./research.md)、[quickstart.md](./quickstart.md)

**Tests**: 本功能只改文档，不新增测试。`pnpm check` 运行现有测试，`tests/package-pack.test.ts` 回归 README 进包。

每个阶段对应一个 commit。

## Phase 1: Setup

- [x] T001 提交 spec、plan、research、quickstart 与 tasks 于 `specs/021-user-facing-readme/`

## Phase 2: Foundational

**Purpose**: 先给 README 移出的内容找好归属，README 重写时只需链接。

- [x] T002 [P] 新建 `docs/configuration.md`：从 README 迁入 YAML 示例、字段表、服务器名规则、透传字段与保存即生效说明
- [x] T003 [P] 在 `docs/how-it-works.md` 目录消息一节补充会话提醒的写入时机表与连续变化合并规则
- [x] T004 [P] 在 `AGENTS.md` 文档索引与 `docs/development.md` 文件地图加入 `docs/configuration.md`

**Checkpoint**: research.md R3 去向表的每一项都能在目标文档中找到。

## Phase 3: User Story 1 + 2 - 判断是否适合并跑通首台服务器 (Priority: P1) 🎯 MVP

**Goal**: 用户读完开头知道插件做什么，按快速开始接入第一台服务器。

**Independent Test**: 读 README 前 5 行说出三项好处；按快速开始接入一台 stdio 服务器。

- [x] T005 [US1] 重写 `README.md` 开头：一句话用途与三项好处，删除内部术语
- [x] T006 [US2] 在 `README.md` 新增「快速开始」：安装、打开面板、新增 MCP、授权、在对话中使用，引用 `src/client/locales.ts` 中的中文界面文案

## Phase 4: User Story 3 - 理解懒加载与授权 (Priority: P2)

**Goal**: 用户理解懒加载开关、每轮收起与会话隔离，掌握授权相关操作。

**Independent Test**: 回答「开启与关闭懒加载的区别」与「为什么下一轮工具被收起」。

- [ ] T007 [US3] 在 `README.md` 新增「懒加载」：开关含义、模型自动打开、每轮结束收起、会话与子代理互不影响、宿主缺少相关服务时工具始终可见
- [ ] T008 [US3] 在 `README.md` 新增「管理服务器」与「登录与授权」：面板按钮用途、凭据存放在 DSH 凭据库、删除会清除授权且无法撤销

## Phase 5: User Story 4 - 常见问题 (Priority: P2)

**Goal**: 用户自助解决常见问题。

**Independent Test**: 在 README 定位 Figma 授权被拒、连接失败、配置错误三类问题的处理步骤。

- [ ] T009 [US4] 在 `README.md` 新增「常见问题」：Figma 授权被拒、授权页未弹出、连接失败、令牌失效、插件因配置错误停用、保存返回冲突

## Phase 6: User Story 5 + Polish (Priority: P3)

**Goal**: 高级用户找到配置参考，文档整体通过质量门禁。

- [ ] T010 [US5] 在 `README.md` 新增「更多文档」：用公网 GitHub 地址链接 `docs/configuration.md`、`docs/known-risks.md` 与开发者文档
- [ ] T011 在 `CHANGELOG.md` 的 Unreleased 加入本次文档条目
- [ ] T012 按 `specs/021-user-facing-readme/quickstart.md` 逐项检查，运行 `pnpm format && pnpm check`

## Dependencies & Execution Order

- Phase 2 完成后开始 Phase 3。
- Phase 3 至 Phase 6 都修改 `README.md`，按顺序执行。
- Phase 2 内 T002、T003、T004 修改不同文件，可并行。

## Implementation Strategy

1. 完成 Phase 2 与 Phase 3，得到可用的 MVP README。
2. 依次补齐懒加载、常见问题与链接。
3. 最后跑质量门禁。
