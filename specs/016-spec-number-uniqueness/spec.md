# Feature Specification: 协作场景的 spec 编号唯一性

**Feature Branch**: `feat/016-spec-number-uniqueness`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "参考模板仓库 dsh-plugin-template 最新 commit `59c91e7`（spec 017 编号唯一性），把创建时推送分支占号、同号自动改号、交付前编号校验移植到本仓库。"

## Clarifications

### Session 2026-11-19

- Q: 编号占号在哪个时刻生效？ → A: 创建 worktree 前推送同名分支。
- Q: 占号失败时创建流程怎么处理？ → A: 中止并删除本地分支，不留下 worktree 与 spec 目录。
- Q: 编号唯一性在哪些节点校验？ → A: 创建 spec 时与交付 PR 前各一次。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 创建 spec 时在远程占号 (Priority: P1)

开发者创建新 spec 后，同一仓库的其他开发者在下一次创建时能看到该编号已被占用。

**Why priority**: 编号只存在于本地时，其他开发者无从感知，这是重复的根因。

**Independent Test**: 在两个克隆里先后执行创建命令，比较分配到的编号。

**Acceptance Scenarios**:

1. **Given** 开发者 A 已创建 spec 且远程存在对应分支，**When** 开发者 B 创建新 spec，**Then** B 拿到更大的编号。
2. **Given** A 的 spec 尚未合入 `main`，**When** B 完成创建，**Then** A 的分支参与 B 的编号计算。

---

### User Story 2 - 同时创建时编号自动收敛 (Priority: P2)

两名开发者几乎同时创建 spec 并拿到同一编号，后写入远程的一方自动改用下一个编号。

**Why priority**: 占号与推送之间存在时间窗，需要自动修复，避免人工重命名分支与目录。

**Independent Test**: 构造两个使用同一编号的分支，执行一次创建流程，检查编号结果。

**Acceptance Scenarios**:

1. **Given** 两个分支都使用编号 002，**When** 创建流程结束，**Then** 远程只有一个 spec 使用 002，另一个使用 003。
2. **Given** 发生改号，**When** 改号结束，**Then** 分支名、worktree 目录与 spec 目录使用同一个新编号。

---

### User Story 3 - 交付前再次校验编号 (Priority: P3)

开发者准备推送分支并创建 PR 时，编号冲突在合入 `main` 之前被拦下。

**Why priority**: 创建时校验之后仍有并发时间窗，交付前是最后一道闸门。

**Independent Test**: 在有同号分支的环境执行交付前校验，检查退出码与冲突列表。

**Acceptance Scenarios**:

1. **Given** 远程存在同编号的其它分支，**When** 执行交付前校验，**Then** 校验失败并列出冲突引用。
2. **Given** 编号无冲突，**When** 执行交付前校验，**Then** 校验通过，流程继续推送与创建 PR。

### Edge Cases

- 开发者离线或没有推送权限。
- 同号分支已合入 `main`，对应 spec 目录已存在。
- 编号被已废弃的 spec 占用。
- 两个同号分支的 short name 不同。
- 主工作区存在未提交的 spec 目录。
- 远程不可达导致同步失败。
- 同号冲突的多个分支同时改号。
- 分支名不含编号时跳过校验。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 创建流程 MUST 在创建 worktree 前把同名分支推送到远程占号，占号成功后创建 worktree。
- **FR-002**: 分配编号前 MUST 同步远程全部分支的引用。
- **FR-003**: 编号 MUST 取远程分支、远程 `main` 的 spec 目录、本地分支与主工作区 spec 目录中的最大值加一。
- **FR-004**: 检测到多个分支使用同一编号时 MUST 保留一个，其余自动改号；改号发生在创建 worktree 之前，分支名、worktree 目录名与 spec 目录名统一使用新编号。
- **FR-005**: 改号顺序 MUST 确定：同号分支按完整分支名排序，保留第一个，其余依次改用后续空闲编号。
- **FR-006**: 占号失败时 MUST 中止创建并删除本地分支，且不留下 worktree 与 spec 目录。
- **FR-007**: 已占用的编号 MUST 不复用，已废弃 spec 的编号继续占用。
- **FR-008**: 交付前 MUST 校验编号唯一性，冲突时 MUST 停止交付并报告冲突引用。
- **FR-009**: 创建命令 MUST 在输出中报告本次是否完成占号，供调用方记录。
- **FR-010**: 控制台文档 MUST 要求创建统一走脚本，禁止只建 worktree 不占号的路径。

### Key Entities

- **Spec 编号**：三位数字，标识一个 spec；出现在分支名、worktree 目录名与 spec 目录名中。
- **占号分支**：`<type>/<NNN>-<short-name>`，创建后立即推送，作为编号存在的依据。
- **Spec 目录**：`specs/<NNN>-<short-name>/`，随分支合并进入 `main`。
- **冲突集合**：同一编号下的远程分支与 `main` 上的同名前缀 spec 目录。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 两个克隆先后创建 spec 时，编号重复次数为 0。
- **SC-002**: 创建 spec 结束时，远程分支存在率为 100%。
- **SC-003**: 同时创建产生的编号冲突在创建流程内收敛，人工改号次数为 0。
- **SC-004**: 现有 spec 的目录名与分支名保持不变。
- **SC-005**: 正常网络下，占号给创建流程增加的耗时不超过 5 秒。
- **SC-006**: 同号 spec 合入 `main` 的次数为 0。

## Assumptions

- 仓库使用单一远程 `origin`，开发者有推送分支的权限。
- 编号保持三位数字，现有编号不回填。
- 主工作区位于 `main` 且干净，按仓库现有约束。
- 脚本继续兼容 Git Bash、Linux 与 macOS，不引入 jq 等新依赖。
