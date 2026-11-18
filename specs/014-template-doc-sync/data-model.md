# Data Model: 同步模板的宪章与主工作区规范

## 宪章原则

| 字段 | 内容 |
| --- | --- |
| 编号与名称 | I 宿主依赖版本、II 测试同步、III 文档结构、IV 质量门禁、V 公开引用 |
| 条款 | 跨需求长期有效的 MUST 或 SHOULD 约束 |
| 版本 | `3.0.0` |

校验规则：原则数量为 5；Sync Impact Report 记录迁移与编号映射。

## 归属文档

| 规则集合 | 唯一归属 |
| --- | --- |
| 宿主入口、严格配置、依赖复用 | `docs/how-it-works.md` |
| 国际化约束与操作 | `docs/i18n.md` |
| 主工作区约束 | `AGENTS.md` |
| worktree 同步步骤 | 创建与结束流程说明 |

校验规则：每条规则在归属文档中完整出现，其他文档使用链接。

### 原原则条款映射

| 原原则 | 条款 | 当前归属 |
| --- | --- | --- |
| I. 宿主契约 | `src/index.ts` 只导出 `name`、`inject`、`apply`、`Config` | `docs/how-it-works.md` 入口契约 |
| I. 宿主契约 | `Config` 声明 schema，热重载字段使用 `.volatile()` | `docs/how-it-works.md` 入口契约 |
| I. 宿主契约 | `name` 与 `cordis.patch.yml` 的插件行 `id` 一致 | `docs/how-it-works.md` 入口契约 |
| I. 宿主契约 | `inject` 列出 `apply` 使用的全部宿主服务 | `docs/how-it-works.md` 入口契约 |
| I. 宿主契约 | 宿主类型经 `src/types.ts` 以 type-only 方式导入 | `docs/how-it-works.md` 入口契约 |
| I. 宿主契约 | 宿主依赖版本保持一致 | 宪章原则 I |
| II. 依赖归属 | 依赖分为宿主提供与插件自备，新增依赖在 plan 声明归属 | `docs/how-it-works.md` 依赖复用 |
| II. 依赖归属 | 宿主提供依赖放入 `devDependencies`，由 `neverBundle` 保持 external | `docs/how-it-works.md` 依赖复用 |
| II. 依赖归属 | 插件自备依赖放入 `dependencies` 与 `alwaysBundle`，打进 `dist` | `docs/how-it-works.md` 依赖复用 |
| II. 依赖归属 | `tests/package-pack.test.ts` 回归发布内容 | `docs/how-it-works.md` 依赖复用 |
| II. 依赖归属 | dsh 子包列入 `minimumReleaseAgeExclude` | 宪章原则 I |
| III. 严格配置 | 配置解析是 `apply` 的第一步 | `docs/how-it-works.md` 宿主运行时 |
| III. 严格配置 | 缺省或 `null` 的键使用默认值 | `docs/how-it-works.md` 宿主运行时 |
| III. 严格配置 | 未知键与非法值抛错，插件加载失败 | `docs/how-it-works.md` 宿主运行时 |
| III. 严格配置 | 解析结果冻结后返回 | `docs/how-it-works.md` 宿主运行时 |
| VIII. 国际化 | 用户可见文案由前端字典或元数据资源提供 | `docs/i18n.md` 约束 |
| VIII. 国际化 | 前端字典提供 `zh` 与 `en`，键集一致 | `docs/i18n.md` 约束 |
| VIII. 国际化 | 各语言提供 `meta.title` 与 `meta.description`，`meta` 键集一致 | `docs/i18n.md` 约束 |
| VIII. 国际化 | 元数据资源在 `package.json` 的 `exports` 与 `files` 中声明 | `docs/i18n.md` 约束 |
| VIII. 国际化 | 译文保留占位符、斜杠命令与 API 字段名 | `docs/i18n.md` 约束 |
| VIII. 国际化 | locale 资源不含 U+200B 与 U+FEFF | `docs/i18n.md` 约束 |
| VIII. 国际化 | 测试覆盖结构、键集与打包内容 | `docs/i18n.md` 约束 |

## 主工作区

| 字段 | 内容 |
| --- | --- |
| 定位 | `git worktree list` 的第一项 |
| 分支 | `main` |
| 状态 | `git status --porcelain` 输出为空 |
| 允许操作 | `git fetch`、`git pull` |

## 同步结果

| 字段 | 内容 |
| --- | --- |
| 时机 | Spec Kit 流程最前的 `/speckit-specify` 前、流程最后的 `/speckit-worktree-finish` 清理后 |
| 同步方式 | fast-forward 到 `origin/main` |
| 输出 | 同步后的提交、是否更新 |
| 停止条件 | 分支不符、工作区脏、历史分叉或网络失败 |
