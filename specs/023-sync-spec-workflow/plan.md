# 实施计划：同步 Spec Kit 访谈与审查流程

**分支**：`feat/023-sync-spec-workflow` | **日期**：2026-11-19 | **规格**：[spec.md](./spec.md)

**输入**：`specs/023-sync-spec-workflow/spec.md`

**状态**：Waived

## 待确认决策

无。

## 澄清记录

### 2026-11-19 会话

| 编号 | 已确认决定 |
| --- | --- |
| Q1 | 完整采用模板提交 `03c8e9e` 的 Spec Kit 流程设计 |
| Q2 | 保留本仓库项目专有说明，只移植通用流程文档变更 |
| Q3 | 完成检查后自动创建并合并 PR |

## 审查记录

- 2026-11-19 | 决定：Waived | 范围：当前完整计划 | 未确认事项：无 | 风险：流程文件未经逐段人工审阅，后续使用偏差通过后续变更修正。

## 摘要

本次同步模板提交 `03c8e9e` 中的五个核心 skill、两个产物模板与两个 integration manifest。`AGENTS.md` 和 `docs/development.md` 只接收通用流程与维护规则，本仓库项目说明、测试说明和文件地图保持项目专有内容。

实施按模板提交的阶段拆分提交：规格基线、模板区块、需求访谈、规格门禁、计划门禁、流程文档与质量检查。交付使用既有 worktree 扩展创建并合并 PR。

## 技术背景

**形式**：Markdown 指令与模板、JSON 清单，无运行时代码变更

**主要依赖**：现有 DSH skill 加载机制与 Spec Kit 文件结构，无新增依赖

**存储**：`.dsh/skills/`、`.specify/` 与 `specs/023-sync-spec-workflow/` 中的文本文件

**验证**：内容与哈希核对、`git diff --check`、`pnpm format && pnpm check`、`pnpm run full-check`

**目标平台**：DSH Agent 的 Spec Kit skill 主流程

**项目类型**：DSH 插件开发流程

**约束**：保留插件运行时行为、现有测试、宪章与 worktree 扩展；跟踪文件只使用公网 URL 或仓库内路径

**规模/范围**：五个核心 skill、两个产物模板、两个 integration manifest、`AGENTS.md`、`docs/development.md` 与本功能文档

## 宪章检查

*Phase 0 前与 Phase 1 后均已逐条复核。*

| 原则 | 结果 | 核验 |
| --- | --- | --- |
| I. 宿主依赖版本 | 通过 | 不变更任何 `@deepseek-ai/*` 依赖、版本或 `minimumReleaseAgeExclude` |
| II. 测试同步 | 通过 | 本次只有流程与文档变更；保持既有测试并运行完整质量检查，无需真实宿主验证 |
| III. 文档结构 | 通过 | `AGENTS.md` 维护强制步骤，skill 维护执行细节，`docs/development.md` 维护命令与维护说明；本次不改插件用户行为 |
| IV. 质量门禁 | 通过 | 实施后运行 `pnpm format && pnpm check`，交付前运行 `pnpm run full-check` |
| V. 公开引用 | 通过 | 新内容只使用仓库相对路径、提交哈希与命令占位符 |

## 项目结构

### 本功能文档

```text
specs/023-sync-spec-workflow/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── workflow.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### 仓库结构

```text
AGENTS.md
docs/development.md
.dsh/skills/
├── speckit-specify/SKILL.md
├── speckit-clarify/SKILL.md
├── speckit-plan/SKILL.md
├── speckit-tasks/SKILL.md
└── speckit-implement/SKILL.md
.specify/
├── integrations/
│   ├── dsh.manifest.json
│   └── speckit.manifest.json
└── templates/
    ├── plan-template.md
    └── spec-template.md
```

**结构决策**：五个 skill、两个模板与两个 manifest 直接采用模板提交内容。项目文档只应用通用流程差异。`.specify/scripts/`、`.specify/workflows/`、插件源码、测试和 worktree 扩展保持现状。

## 设计

### 受管文件同步

1. 从模板提交 `03c8e9e` 读取五个核心 skill、两个模板与两个 manifest。
2. 当前九个文件均与模板父提交 `59c91e7` 一致，可直接采用目标版本。
3. 保持 front matter、Markdown 结构和 JSON 字段顺序与模板一致。
4. 复制后重新计算 SHA-256，确认清单与实际文件一致。

### 项目文档同步

1. `AGENTS.md` 的开发流程表采用模板提交中的六阶段规则。
2. `docs/development.md` 采用模板提交中的流程产出、纯文档质量门禁、核心流程维护说明和 integrations 文件地图。
3. 本仓库的实机验证、插件测试清单、项目命令与其他文件地图保持原有归属内容。
4. 本功能规格与发布历史由本仓库独立维护。

### 交付

1. 每个实施阶段完成对应检查后提交。
2. 最终审查完整 diff，确认九个受管文件与模板一致，项目文档只包含预期通用规则。
3. 运行完整质量检查。
4. 按用户授权推送分支、创建 PR、等待 CI 并合并，随后清理 worktree 并同步主工作区。

## 验证

- 审查五个 skill 的阶段顺序、探索前置条件、分批访谈与审查出口。
- 审查两个模板都包含状态、待确认决策、澄清记录和审查记录。
- 检查项目文档中的强制步骤、门禁和维护说明。
- 核对两个 manifest 的哈希与实际文件一致。
- 运行 `git diff --check`、`pnpm format && pnpm check` 与 `pnpm run full-check`。

## 复杂度跟踪

无宪章偏离。
