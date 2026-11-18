<!--
Sync Impact Report
- Version change: 2.0.0 → 2.1.0
- Added principles: VIII. 国际化
- Modified principles: 无
- Removed principles: 无
- Follow-up TODOs: 无
-->

# dsh-plugin-better-mcp Constitution

## Core Principles

### I. 宿主契约

- `src/index.ts` MUST 只导出宿主约定的 `name`、`inject`、`apply`、`Config`。
- `Config` MUST 声明配置 schema，需要热重载的字段用 `.volatile()` 标记。
- `name` MUST 与 `cordis.patch.yml` 中插件行的 `id` 一致。
- `inject` MUST 列出 `apply` 用到的全部宿主服务。
- 宿主类型 MUST 经 `src/types.ts` 以 type-only 方式导入。
- `@deepseek-ai/*` 依赖版本 MUST 与运行宿主一致；升级宿主时 MUST 同步全部宿主依赖。

理由：宿主 loader 依靠这些导出识别和启用插件，`Config` 让宿主校验配置并向“插件”面板提供表单。依赖与宿主同版本可避免接口错位。

### II. 依赖归属

- 依赖分为宿主提供与插件自备两类，新增依赖 MUST 在 plan 中声明归属。
- 宿主自带的依赖 MUST 放在 `devDependencies`：
  - cordis、dsh-tools、schemastery、zod 等宿主实例。
  - 打包时 MUST 保持 external，由 `tsdown.config.ts` 的 `neverBundle` 保证。
- 宿主未提供的依赖 MUST 打包进 `dist`：
  - 加入 `dependencies`，并在 `tsdown.config.ts` 的 `alwaysBundle` 中列出包名。
  - 打包后 MUST 由 `tests/package-pack.test.ts` 回归发布内容。
- 新增 `@deepseek-ai/dsh-*` 依赖 MUST 同步加入 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude`。

理由：插件与宿主共享同一份实例，重复安装会产生两份实例；宿主没有的依赖必须随插件分发，否则用户环境缺少模块。

### III. 严格配置

- 配置解析 MUST 是 `apply` 的第一步。
- 缺省或 `null` 的键 MUST 使用默认值。
- 未知键与非法值 MUST 抛错，让插件加载失败。
- 解析结果 MUST 冻结后返回。

理由：配置错误在加载时暴露，最容易排查。

### IV. 测试同步（不可协商）

- 代码变更 MUST 同步新增或更新 `tests/`。
- 测试 MUST 验证真实行为，不复述默认值或文案。
- 单元测试 MUST 使用 `tests/helpers.ts` 的模拟 `ctx`。
- 发布内容 MUST 由 package-pack 测试回归：
  - 进包：`dist`、`cordis.patch.yml`、`README.md`、`icon.svg`、`locale/*.json`。
  - 不进包：`src`、`tests`、`scripts`、`specs`、`docs`。
- 涉及宿主装载或真实对话链路的变更 SHOULD 在真实宿主上做端到端验证。
- `dsh` 版本变更后 MUST 提醒用户执行实机测试，并说明变更的版本号。

理由：插件运行在宿主内部，缺少测试的问题只会在用户环境出现。

### V. 文档结构

文档分为五类，每类只写归属于自己的内容：

| 文档 | 读者 | 归属内容 |
| --- | --- | --- |
| `README.md` | 插件用户 | 功能、安装、配置、工具 |
| `AGENTS.md` | 每个会话的 Agent | 通用的信息和指令 |
| 本宪章 | 执行 Spec Kit 流程的 Agent 与维护者 | 变更过程中必须遵循的硬约束 |
| `docs/` | 开发者 | 工作机制、已知风险、开发说明 |
| 代码注释 | 读代码的人 | 文件职责、函数与常量用途 |

引用规则：

- 每条信息 MUST 只有一个归属文档。
- 其他文档引用时 MUST 只放链接，禁止相互复述。
- 复述指完整重写另一文档已归属的规则或说明。以下不算复述：
  - 链接及其一句话锚文本。
  - `AGENTS.md` 文档索引中的条目说明。
  - 代码注释中与该代码相关的一句理由。
- `README.md` 省略实现细节。

同步要求：

- 用户可见行为变化 MUST 更新 `README.md`。
- 机制、风险、流程或文件结构变化 MUST 更新对应的归属文档。
- CHANGELOG MUST 按分支规则维护：
  - `main` 上每个 commit 都增加条目。
  - 其他分支在 push 或 merge 时增加。

注释规则：

- 文件顶部 MUST 用一两句话说明职责和关键导出。
- 函数与常量 MUST 用一句话说明用途。

理由：每条信息只在一处维护，文档之间不会相互矛盾；按读者分类让信息出现在固定位置。

### VI. 质量门禁

- 文件变更后 MUST 运行 `pnpm format && pnpm check`。
- 合并前 MUST 通过 `pnpm check`。

理由：`pnpm check` 与 CI 运行同一组检查，问题在提交前暴露。

### VII. 公开引用

提交到 git 的全部跟踪文件 MUST 只引用公网 URL 或仓库内路径。范围包括代码、配置、文档、skill 与 `specs/`。

禁止：

- 本机绝对路径，例如盘符路径或用户主目录。
- 指向仓库外的相对路径。
- `package.json` 中指向仓库外的 `file:` 或 `link:` 依赖。
- 其他用户无权访问的 URL。

允许：

- 占位符路径，例如 `<repo>`、`file:///<repo>/dist/index.mjs`。
- 本地回环地址的运行时说明，例如 `http://127.0.0.1:<port>`。

理由：其他用户克隆仓库后，每个链接、路径与依赖都必须能在其环境中解析。

### VIII. 国际化

- 用户可见文案 MUST 经前端字典或元数据资源提供：
  - 前端字典：`src/client/locales.ts`，由 `ctx.locale.register` 注册。
  - 元数据资源：`locale/<语言 id>.json` 的 `meta`。
- 前端字典 MUST 同时提供 `zh` 与 `en`，两份键集 MUST 一致。
- `meta.title` 与 `meta.description` MUST 为每种基线语言各写一份，各文件的 `meta` 键集 MUST 一致。
- 元数据资源 MUST 在 `package.json` 的 `exports` 与 `files` 中声明。
- 译文 MUST 保留占位符、斜杠命令与 API 字段名的原文。
- locale 资源 MUST 不含零宽空格 U+200B 与 BOM U+FEFF。
- 文案与元数据的变更 MUST 由测试覆盖结构、键集与打包内容。
- 国际化规范 MUST 归属 `docs/i18n.md`。

理由：宿主按语言回退链读取这两处资源。缺一份基线语言或漏掉打包声明时，用户看到英文包名或键名。规范单归属一处，作者能一次查全。

## Governance

优先级从高到低：

1. 用户的明确要求。
2. 本宪章。
3. `AGENTS.md` 与其他文档。

冲突处理：

- 用户要求与本宪章、开发流程或其他项目要求冲突时，Agent MUST 先指出冲突的条款及影响，再按用户要求执行。
- Spec Kit 流程中偏离本宪章时，MUST 在 plan 的 Complexity Tracking 中记录：
  - 用户要求导致的偏离，理由注明「用户要求」。
  - 其他偏离写明理由，否则视为阻塞。
- 本宪章与其他文档冲突时以本宪章为准，并同步修正该文档。

修订：

- 修订通过 `/speckit-constitution` 进行，版本号按语义化规则递增：
  - MAJOR：删除或重新定义原则。
  - MINOR：新增原则或实质扩展。
  - PATCH：措辞澄清。
- `/speckit-plan` 的 Constitution Check 与 `/speckit-analyze` MUST 逐条核对本宪章。

**Version**: 2.1.0 | **Ratified**: 2026-11-17 | **Last Amended**: 2026-11-18