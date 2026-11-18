# Feature Specification: 同步模板的宪章与主工作区规范

**Feature Branch**: `docs/014-template-doc-sync`

**Created**: 2026-11-18

**Status**: Draft

**Input**: 查看 `dsh-plugin-template` 最近两个 commit（`e417c35` 宪章精简、`fde16ee` 主工作区约束与 main 同步），仿照其修订本项目 spec 与文档。「同步 `origin/main`」必须明确位于 Spec Kit 整体流程的最前面与最后面。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Constitution Check 只核对硬约束 (Priority: P1)

执行 `/speckit-plan` 的 Agent 逐条核对宪章，每条原则都是跨需求长期有效且可以检验的约束。

**Why this priority**: 宿主入口、配置解析、依赖打包与国际化操作属于各自归属文档。宪章只保留跨流程硬约束后，Constitution Check 更聚焦。

**Independent Test**: 阅读宪章，原则只有宿主依赖版本、测试同步、文档结构、质量门禁与公开引用五条，版本按 MAJOR 升级。

**Acceptance Scenarios**:

1. **Given** 宪章，**When** 列出原则，**Then** 依次为 I 宿主依赖版本、II 测试同步、III 文档结构、IV 质量门禁、V 公开引用。
2. **Given** 宪章的宿主依赖版本原则，**When** 对照包清单与 pnpm 配置，**Then** 能判定全部宿主依赖版本与 `minimumReleaseAgeExclude` 是否合规。
3. **Given** 宪章版本行，**When** 查看版本，**Then** 版本为 `3.0.0`，Sync Impact Report 记录原则迁移与重新编号。

---

### User Story 2 - 移出的规则仍有唯一归属 (Priority: P1)

维护者在工作机制与国际化文档中查到宿主入口、配置解析、依赖归属和国际化的完整规则，现行引用指向正确位置。

**Why this priority**: 规则迁入归属文档后，维护者仍能一次查全，文档之间保持单一事实源。

**Independent Test**: 逐条对照原宪章的宿主契约、依赖归属、严格配置与国际化原则，每条规则都能在一个归属文档中找到。

**Acceptance Scenarios**:

1. **Given** 原宿主契约、严格配置与依赖归属规则，**When** 查阅 `docs/how-it-works.md`，**Then** 每条规则都有完整表述。
2. **Given** 原国际化原则，**When** 查阅 `docs/i18n.md`，**Then** 每条约束都有完整表述。
3. **Given** 现行文档、skill 与扩展命令，**When** 查找宪章原则编号引用，**Then** 每处编号都指向重新编号后的正确原则。
4. **Given** 指向已删除原则的链接，**When** 查阅对应文档，**Then** 链接改为指向承接规则的归属文档。

---

### User Story 3 - 主工作区只用于同步 (Priority: P1)

Agent 收到变更要求时，从 `AGENTS.md` 得知主工作区约束，在 feature worktree 中完成全部修改。Spec Kit 整体流程的最前面与最后面，Agent 分别把主工作区 `main` 快进到 `origin/main`。第一次同步先于 `/speckit-specify`，第二次同步在 `/speckit-worktree-finish` 的清理阶段完成。

**Why this priority**: 主工作区是所有 worktree 的创建起点与清理落点。固定分支、干净状态与同步流程保证每次需求使用最新基线。

**Independent Test**: 只读 `AGENTS.md`、worktree 创建与结束说明，能列出主工作区约束、同步时机、停止条件与结果汇报要求。

**Acceptance Scenarios**:

1. **Given** `AGENTS.md`，**When** 查找主工作区约束，**Then** 看到主工作区 MUST 位于 `main`、保持干净，只允许 `git fetch` 与 `git pull`，全部变更在 worktree 中进行。
2. **Given** 主工作区 `main` 落后 `origin/main`，**When** 进入 Spec Kit 流程，**Then** 流程最前在 `/speckit-specify` 前以 fast-forward 方式同步。
3. **Given** 主工作区位于其他分支、有未提交改动或含有远端之外的本地提交，**When** 开始新需求，**Then** 流程要求停止并报告原因。
4. **Given** 需求交付或放弃后的 worktree 清理完成，**When** 执行结束流程，**Then** Spec Kit 流程最后在清理后同步主工作区 `main` 并报告结果。
5. **Given** 结束时主工作区不满足约束，**When** 执行同步，**Then** 流程要求报告原因并保留主工作区现状。

---

### Edge Cases

- 历史 spec 与已发布变更记录保留当时的原则编号。
- 主工作区已与 `origin/main` 一致时，同步结果报告未更新。
- 会话已在 feature worktree 内时，创建流程仍检查主工作区。
- 被 `.gitignore` 忽略的文件不计入脏状态。
- 无法连接 `origin` 时，创建流程停止并报告网络错误。

## Requirements *(mandatory)*

### Functional Requirements

**宪章与规则归属**

- **FR-001**: 宪章原则 MUST 依次为 I 宿主依赖版本、II 测试同步、III 文档结构、IV 质量门禁、V 公开引用。
- **FR-002**: 原则 II–V MUST 保留原原则 IV、V、VI、VII 的条款，仅调整编号。
- **FR-003**: 原则 I MUST 以同版本 `@deepseek-ai/dsh-agent` 为宿主依赖版本依据，并要求每个 `@deepseek-ai/dsh-*` 依赖以同版本列入 `minimumReleaseAgeExclude`。
- **FR-004**: 宪章修订 MUST 经 `/speckit-constitution` 进行，版本 MUST 升到 `3.0.0`。
- **FR-005**: 原宿主契约、依赖归属与严格配置规则 MUST 完整迁入 `docs/how-it-works.md`。
- **FR-006**: 原国际化规则 MUST 完整迁入 `docs/i18n.md`。
- **FR-007**: 现行文档、skill 与扩展命令中的原则编号引用 MUST 同步；已删除原则的引用 MUST 改为归属文档链接。

**主工作区与流程**

- **FR-008**: `AGENTS.md` MUST 规定主工作区位于 `main` 且 `git status --porcelain` 输出为空。
- **FR-009**: `AGENTS.md` MUST 规定主工作区只运行 `git fetch` 与 `git pull`，任何变更都在 worktree 中进行。
- **FR-010**: 主工作区约束 MUST 归属 `AGENTS.md`，宪章不增加对应原则。
- **FR-011**: Spec Kit 流程最前 MUST 在 `/speckit-specify` 前检查主工作区并以 fast-forward 方式同步 `origin/main`；分支不符、工作区脏或历史分叉时 MUST 停止。
- **FR-012**: Spec Kit 流程最后 MUST 在 `/speckit-worktree-finish` 的交付或放弃清理阶段同步主工作区；约束不满足时 MUST 报告原因并保留现状。
- **FR-013**: 创建与结束说明 MUST 要求输出同步后的提交与是否更新。
- **FR-014**: `docs/development.md` MUST 同步 Spec Kit 流程与原则编号说明，`CHANGELOG.md` MUST 记录本次规范与流程修订。
- **FR-015**: 本次变更 MUST 只修改 spec、项目文档与流程说明，插件运行时代码和 worktree 脚本保持现状。
- **FR-016**: 变更 MUST 通过 `pnpm format && pnpm check`。

### Key Entities

- **宪章原则**：Constitution Check 与 analyze 逐条核对的跨流程硬约束。
- **归属文档**：按文档结构原则承载某类规则的唯一文档。
- **主工作区**：`git worktree list` 的第一项，即仓库根目录的检出。
- **同步结果**：主工作区同步后的提交与本次是否发生更新。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 宪章原则数为 5，版本为 `3.0.0`。
- **SC-002**: 移出宪章的规则 100% 能在一个归属文档中找到。
- **SC-003**: 现行文档与流程说明中的错误或失效原则引用数为 0。
- **SC-004**: 只读 `AGENTS.md` 与 worktree 流程说明，能在 1 分钟内列全主工作区约束、两个同步时机与三类停止条件。
- **SC-005**: `pnpm check` 全部通过。

## Assumptions

- 本插件沿用模板保留的五条宪章原则，宿主依赖以仓库声明的 `@deepseek-ai/dsh-agent` 版本为准。
- 主工作区同步通过流程说明约束 Agent 执行 `git fetch` 与 `git pull --ff-only`，本次不引入新脚本。
- 模板定位与模板转化属于模板仓库，本项目不承接对应文档。
- 历史 spec 与已发布变更记录保持原样。
- 插件运行时行为、依赖版本与发布配置保持现状。
