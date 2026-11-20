# 实施计划：迁移模板的实机热更新与前端链接规则

**分支**：`feat/026-template-hot-reload` | **日期**：2026-11-20 | **规格**：[spec.md](./spec.md)

**输入**：`specs/026-template-hot-reload/spec.md`

**状态**：Waived

## 待确认决策

无。

## 澄清记录

### 2026-11-20 会话

| 编号 | 已确认决定 |
| --- | --- |
| D-001 | 不搬模板 spec 产物，本次只写 `specs/026-template-hot-reload` |
| D-002 | 每轮结束删除 profile，报告写入 `specs/<NNN>-<name>/real-device-report.md`，留证截图复制到 `.rdt-shots/` |
| D-003 | 取消 `pnpm pack` 安装，改链接安装 |
| D-004 | 热更新验证改 `src/tools.ts` 中 `mcp_manage` 的工具说明 |
| D-005 | skill 不复制 HMR 配置写法，引用 `docs/development.md` |
| D-006 | 装载用例不检测非链接安装，只改断言语义 |
| D-007 | 报告结构新增「热更新验证」一节 |

## 审查记录

- 2026-11-20 | 决定：Waived | 范围：当前完整计划 | 未确认事项：无 | 风险：链接安装与 HMR 补丁依赖宿主 `0.2.2-rc.3` 的实际行为，全部改动需实机跑通后合入。

## 摘要

迁移模板提交 `fe93cd0`（实机热更新）与 `197480e`（前端 UI 链接规则）。

热更新部分：实机搭建改为 `dsh plugin add <repo>` 链接安装，profile 补丁加入监听仓库 `dist` 的 `hmr` 条目；skill 补充「改代码 → 构建 → 同一实例观察」迭代流程、每轮删除 profile 与热更新排错。装载用例只改文案，不再打包安装。

文档部分：`docs/development.md` 在「前端构建」后新增「前端 UI 链接」小节。

本项目与模板的差异按现有 skill 适配：保留 `RDT_PLUGIN_CONFIG`、MCP 用例脚本与中文本地化，模板中的 `src/demo-tool.ts` 换成 `src/tools.ts` 的 `mcp_manage` 说明。

## 技术背景

**语言与版本**：skill 脚本为 Bash 与 Node ESM；文档为 Markdown；插件不改。

**主要依赖**：宿主 `@deepseek-ai/dsh-agent` `0.2.2-rc.3`；本机已有 `~/.dsh-local/dsh-0.2.2-rc.3`。HMR 由宿主的 `dsh-hmr` 与 `dsh-client-hmr` 提供，配置写法已记录在 `docs/development.md` 的「热更新」。

**存储**：实机 profile 的 `package.json`（`link:` 依赖与 bundles）、`cordis.patch.yml`（隔离配置与 HMR）、会话与截图目录。

**验证**：`pnpm format && pnpm check`；一轮实机回归：搭建 → 后端用例 → GUI 内构建后观察 → 删除 profile。

**目标平台**：Windows + Git Bash；DSH web profile。

**约束**：不改 `src/`、`tests/` 与 `dist/`；`gui-up.sh`、`browser-test.mjs`、`mock-provider.mjs` 与 MCP 用例脚本不改；跟踪文件只引用公网 URL 或仓库内路径。

**规模**：一个搭建脚本、一个驱动脚本的文案、三份 skill 文档、一份开发文档与变更记录。

## 宪章检查

| 原则 | 结果 | 核验 |
| --- | --- | --- |
| I. 宿主依赖版本 | 通过 | 不新增或升级 `@deepseek-ai/*` 依赖 |
| II. 测试同步 | 通过 | 不改插件行为；实机脚本变更由一轮实机回归覆盖，报告写入 `specs/026-template-hot-reload/real-device-report.md` |
| III. 文档结构 | 通过 | 实机流程归 skill，本地开发与 HMR 机制归 `docs/development.md`，skill 只引用不复制 |
| IV. 质量门禁 | 通过 | 提交前运行 `pnpm format && pnpm check` |
| V. 公开引用 | 通过 | 脚本用 `<repo>` 占位符；生成的 profile 不入库 |

结论：逐条通过，无复杂度追踪项。

## 实现方案

### 1. 搭建脚本

`.dsh/skills/real-device-test/scripts/setup-env.sh`：

1. 第 4 步改为 `dsh plugin --profile "$PROFILE" add "$REPO"`，删除 `pnpm pack` 与 tgz 处理。
2. 第 5 步的补丁模板加入 `- id: hmr` 与 `config.root: ["$REPO/dist"]`；复用已有 profile 且缺该块时补齐，并去掉孤立的 `[]` 占位行。
3. 结尾提示补充「构建后自动生效」与「结束删除 profile」。

### 2. 驱动脚本

`.dsh/skills/real-device-test/scripts/run-test.mjs`：A1 断言不变，提示文案从「已安装」改为「加载」。

### 3. skill 文档

1. `SKILL.md`：阶段 0 说明构建是迭代动作；阶段 1 改为链接安装与 HMR 补丁；新增「在同一实例中迭代」小节（含一次热更新的验证步骤）；阶段 5 改为先保存报告与截图，再删除 profile；A1 行文案同步。
2. `references/pitfalls.md`：新增「热更新」排错表。
3. `references/cases.md`：新增热更新验证步骤，报告结构增加「热更新验证」一节。

### 4. 开发文档

`docs/development.md` 在「前端构建」后新增「前端 UI 链接」小节：`a` 标签的 `href` 用完整 URL，说明 Desktop 以应用内地址加载页面的原因。

### 5. 变更记录

`CHANGELOG.md` 在 `## Unreleased` 下补两条：热更新、前端链接规则。

## 验证

1. `pnpm format && pnpm check`。
2. `bash .dsh/skills/real-device-test/scripts/setup-env.sh <worktree 路径> rdt-026-hot-reload`，确认 profile 为 `link:` 依赖、补丁含 `hmr`。
3. 运行 `mcp-cases.mjs` 与 `run-test.mjs` 的后端用例。
4. 启动 GUI，改 `src/tools.ts` 的 `mcp_manage` 说明，`pnpm build`，确认同一实例加载新说明且进程号不变。
5. 写报告，复制留证截图到 `.rdt-shots/`，删除 profile。

## 项目结构

```text
specs/026-template-hot-reload/
├── spec.md
├── plan.md
├── tasks.md
├── real-device-report.md
└── checklists/requirements.md

.dsh/skills/real-device-test/
├── SKILL.md
├── references/cases.md
├── references/pitfalls.md
└── scripts/{setup-env.sh,run-test.mjs}

docs/development.md
CHANGELOG.md
```

## 复杂度追踪

无宪章偏离。
