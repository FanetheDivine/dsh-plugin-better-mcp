# Implementation Plan: 同步模板的宪章与主工作区规范

**Branch**: `docs/014-template-doc-sync` | **Date**: 2026-11-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-template-doc-sync/spec.md`

## Summary

把宪章收敛为五条跨流程硬约束，将宿主契约、配置、依赖与国际化规则迁入归属文档。`AGENTS.md` 与 worktree 流程说明增加主工作区约束，并把 `origin/main` 同步明确放在 Spec Kit 整体流程的最前面与最后面。交付内容限于 spec、项目文档与流程说明。

## Technical Context

**Language/Version**: Markdown，沿用现有中文文档规范

**Primary Dependencies**: Spec Kit、现有 worktree 扩展说明；无新增依赖

**Storage**: N/A

**Testing**: `pnpm format && pnpm check`；文档检索与 quickstart 人工核对

**Target Platform**: DSH Agent 与插件维护者

**Project Type**: 项目治理与开发流程文档

**Performance Goals**: N/A

**Constraints**: 历史 spec 与已发布变更记录保持原样；运行时代码、依赖和 worktree 脚本保持现状

**Scale/Scope**: 1 个新 feature 目录、宪章、5 份项目文档、4 份 worktree 流程说明

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 结果 | 核对 |
| --- | --- | --- |
| I. 宿主契约 | 通过 | 宿主入口与类型导入规则完整迁入工作机制文档 |
| II. 依赖归属 | 通过 | 不新增依赖；依赖归属规则完整迁入工作机制文档 |
| III. 严格配置 | 通过 | 配置规则完整迁入工作机制文档 |
| IV. 测试同步 | 通过 | 本次只改文档；运行 `pnpm check` 回归现有行为 |
| V. 文档结构 | 通过 | 每条迁移规则只有一个归属文档，其余位置使用链接 |
| VI. 质量门禁 | 通过 | 完成后运行 `pnpm format && pnpm check` |
| VII. 公开引用 | 通过 | 新增内容只使用仓库内路径与命令名 |
| VIII. 国际化 | 通过 | 国际化约束完整迁入 `docs/i18n.md` |

**Post-design**: 通过。research、data-model 与 quickstart 未引入新依赖、运行时变更或外部引用。

## Project Structure

### Documentation (this feature)

```text
specs/014-template-doc-sync/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
.specify/
├── memory/constitution.md
└── extensions/worktree/commands/
    ├── speckit.worktree.create.md
    └── speckit.worktree.finish.md
.dsh/skills/
├── speckit-worktree-create/SKILL.md
└── speckit-worktree-finish/SKILL.md
docs/
├── development.md
├── how-it-works.md
├── i18n.md
└── known-risks.md
AGENTS.md
CHANGELOG.md
```

**Structure Decision**: 宪章只保留硬约束；插件机制规则归属 `docs/how-it-works.md`，国际化规则归属 `docs/i18n.md`，会话级主工作区规则归属 `AGENTS.md`，同步步骤归属 worktree 流程说明。

## Complexity Tracking

无偏离。
