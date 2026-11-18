# Implementation Plan: 同步模板的元数据国际化规范与产物测试新鲜度

**Branch**: `chore/013-template-sync` | **Date**: 2026-11-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-template-sync/spec.md`

## Summary

按模板的两个 commit 对齐本插件：

1. 把源码测试与产物测试拆成两个入口。`check` 只跑源码测试，`build` 末尾跑产物测试；产物测试读取 `dist` 前用共享的 `assertFreshDist` 校验产物齐全且新于构建输入，失败时提示运行 `pnpm build`。
2. 把已有的 `locale/` 元数据纳入测试与文档：新增 `tests/metadata.test.ts` 校验结构、键集、禁用字符与打包声明，新增 `docs/i18n.md` 作为唯一规范文档，并在宪章新增国际化原则。

## Technical Context

**Language/Version**: TypeScript 6.0.3，Node.js >= 24.9.0

**Primary Dependencies**: vitest 4.1.10、tsdown 0.22.14、@biomejs/biome 2.5.8、pnpm 11.7.0。本次不新增依赖。

**Storage**: 文件系统：`dist/` 产物、`locale/*.json` 元数据、`package.json` 清单。

**Testing**: vitest 两个 project：`code` 运行 `tests/**/*.test.ts` 与 `tests/**/*.test.mjs`；`dist` 只运行 `tests/client-bundle.test.ts` 与 `tests/package-pack.test.ts`。

**Target Platform**: 维护者本机（Windows / Linux）与 GitHub Actions Node 24。

**Project Type**: DSH 插件（单项目，宿主入口 + 浏览器入口 + 测试与文档）。

**Performance Goals**: 元数据测试单次运行 < 1 秒；新鲜度检查只做 `stat` 与目录遍历，对 `test:dist` 增加 < 100 ms。

**Constraints**: 产物测试不触发构建；`check` 不访问 `dist`；不新增依赖；元数据文件内容不改动。

**Scale/Scope**: 14 个测试文件，其中 2 个产物测试；2 个基线语言资源；1 条新增宪章原则；4 份文档更新。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 核对结果 |
| --- | --- |
| I. 宿主契约 | 通过：`src/index.ts` 的导出、`Config` 与 `cordis.patch.yml` 不改动。 |
| II. 依赖归属 | 通过：不新增依赖，`tsdown.config.ts` 的 external 列表不改动。 |
| III. 严格配置 | 通过：配置 schema 与解析逻辑不改动。 |
| IV. 测试同步 | 通过：新增 `tests/metadata.test.ts` 与 `tests/dist-freshness.test.ts`，更新两个产物测试；发布内容断言保持 `locale/*.json`。 |
| V. 文档结构 | 通过：国际化规范单归属 `docs/i18n.md`，其余文档只放链接；`AGENTS.md` 索引、开发文档、README 与 CHANGELOG 同步。 |
| VI. 质量门禁 | 通过：实施后运行 `pnpm format && pnpm check`，再运行 `pnpm build` 验证产物测试。 |
| VII. 公开引用 | 通过：新增文档只引用仓库内相对路径与公开事实，不含本机绝对路径。 |
| VIII. 国际化（本次新增） | 通过：本次即落实该原则：资源位置、基线语言键集一致、打包声明、禁用字符与测试覆盖。 |

Constitution Check 通过，无需在 Complexity Tracking 记录偏离。宪章版本按 MINOR 从 2.0.0 递增到 2.1.0。

## Project Structure

### Documentation (this feature)

```text
specs/013-template-sync/
├── plan.md              # 本文件
├── research.md          # Phase 0：模板对齐结论
├── data-model.md        # Phase 1：产物新鲜度与元数据校验模型
├── quickstart.md        # Phase 1：验证步骤
├── contracts/           # Phase 1：命令与元数据契约
└── tasks.md             # Phase 2：任务清单
```

### Source Code (repository root)

```text
src/
├── index.ts             # 宿主入口（不改动）
└── client/              # 浏览器入口与字典（不改动）

tests/
├── support/
│   ├── primitives.ts
│   └── dist-freshness.ts        # 新增：构建输入/产物清单与新鲜度判定
├── dist-freshness.test.ts       # 新增：新鲜、过期、缺失、部分缺失
├── metadata.test.ts             # 新增：元数据结构、键集、禁用字符、清单声明
├── client-bundle.test.ts        # 改为产物测试，读取 dist 前校验新鲜度
└── package-pack.test.ts         # 改为产物测试，读取 dist 前校验新鲜度

locale/
├── en.json              # 不改动
└── zh.json              # 不改动

docs/
├── i18n.md              # 新增：国际化规范（唯一归属）
├── development.md       # 命令表、测试表、文件地图、资料链接
├── how-it-works.md      # 国际化规范链接
└── known-risks.md       # 国际化风险条目

.specify/memory/constitution.md # 新增原则 VIII，版本 2.1.0
.github/workflows/ci.yml        # check job 名称
package.json                    # 测试入口与 build 链
vitest.config.ts                # code / dist 两个 project
```

**Structure Decision**: 沿用现有单项目布局。新增模块只放测试支撑与文档，运行时代码零改动，避免把工具链逻辑混入 `src/`。

## Phase 0: Research

结论写入 [research.md](./research.md)：

1. 构建输入与产物清单按模板取值，补上本插件的 `tsdown.config.ts`、`tsconfig*.json` 与 `package.json`。
2. 新鲜度判定用「最旧产物 vs 全部输入」的修改时间比较，覆盖产物缺失与部分缺失。
3. 元数据测试覆盖模板的全部断言，本插件的 `meta` 不含 `detail`，按可选处理。
4. 归档式 `tsc` 生成类型声明，纳入产物清单，避免类型过期漏检。

## Phase 1: Design

- [data-model.md](./data-model.md)：产物、构建输入、新鲜度判定、元数据资源与清单声明。
- [contracts/dist-freshness.md](./contracts/dist-freshness.md)：命令契约与失败信息格式。
- [contracts/metadata.md](./contracts/metadata.md)：元数据结构与清单声明契约。
- [quickstart.md](./quickstart.md)：干净检出、过期产物、元数据破坏三类验证。

## Complexity Tracking

无偏离。