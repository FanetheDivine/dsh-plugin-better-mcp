# Implementation Plan: 面向用户的 README

**Branch**: `docs/021-user-facing-readme` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/021-user-facing-readme/spec.md`

## Summary

按用户任务重写 README：开头讲用途与好处，随后是快速开始、日常使用、常见问题。完整 YAML 字段参考移到 `docs/configuration.md`。README 移出的机制细节由 `docs/how-it-works.md` 承接，缺失处补齐。

## Technical Context

**Language/Version**: Markdown

**Primary Dependencies**: 无

**Storage**: 无

**Testing**: `tests/package-pack.test.ts` 回归 README 进包；`pnpm check` 运行 biome 与全部测试

**Target Platform**: npm 包页面、GitHub 仓库页面、DSH 插件详情页

**Project Type**: DSH 插件文档

**Performance Goals**: 无

**Constraints**: 遵循写作规范；README 中的链接在 npm 页面也能打开

**Scale/Scope**: `README.md`、新增 `docs/configuration.md`、`docs/how-it-works.md`、`docs/development.md` 文件地图、`AGENTS.md` 文档索引、`CHANGELOG.md`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I 宿主依赖版本**: 通过。不改依赖。
- **II 测试同步**: 通过。无代码变更；README 仍进包，`docs/configuration.md` 随 `docs/` 不进包，由现有 package-pack 测试回归。
- **III 文档结构**: 偏离。宪章把「配置」归属 README，`docs/` 的读者为开发者。用户要求把字段参考移到 `docs/configuration.md`，见 Complexity Tracking。其余条款通过：每条信息只保留一个归属，README 对配置参考只放链接，CHANGELOG 在 push 时补条目。
- **IV 质量门禁**: 通过。完成后运行 `pnpm format && pnpm check`。
- **V 公开引用**: 通过。README 指向 `docs/` 的链接使用公网 GitHub 地址，`docs/` 内部使用仓库内相对路径。

设计后复查：I、II、IV、V 通过；III 的偏离已记录。

## Project Structure

### Documentation (this feature)

```text
specs/021-user-facing-readme/
├── plan.md
├── research.md
├── quickstart.md
└── tasks.md
```

本功能只改文档，没有数据模型与接口契约，省略 `data-model.md` 与 `contracts/`。

### Source Code (repository root)

```text
README.md                  # 用户文档：用途、快速开始、使用、常见问题
docs/
├── configuration.md       # 新增：YAML 配置参考
├── how-it-works.md        # 承接 README 移出的机制细节
└── development.md         # 文件地图加入 configuration.md
AGENTS.md                  # 文档索引加入 configuration.md
CHANGELOG.md               # Unreleased 条目
```

**Structure Decision**: 在现有文档结构内调整，新增一份配置参考文档。

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| 配置字段参考放在 `docs/configuration.md`，偏离宪章 III 中 README 归属「配置」 | 用户要求 | 保留在 README 末尾被用户否决 |
