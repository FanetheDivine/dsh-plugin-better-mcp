# Quickstart: 同步模板的宪章与主工作区规范

## 前置条件

- 当前检出位于 `docs/014-template-doc-sync`。
- 已安装项目依赖。

## 1. 核对宪章

1. 打开 `.specify/memory/constitution.md`。
2. 确认只有五条 Core Principles，顺序见 [data-model.md](./data-model.md#宪章原则)。
3. 确认版本为 `3.0.0`，Sync Impact Report 记录原则迁移与编号映射。
4. 确认宿主依赖版本以 `@deepseek-ai/dsh-agent` 为基准。

## 2. 核对规则归属

1. 在 `docs/how-it-works.md` 查找入口导出、`.volatile()`、type-only 导入、严格配置与依赖打包规则。
2. 在 `docs/i18n.md` 查找基线语言、键集、包清单、禁用字符与测试约束。
3. 在 `docs/known-risks.md` 与 `docs/development.md` 核对链接指向当前原则或归属文档。
4. 历史 spec 与既有 CHANGELOG 条目保持原样。

## 3. 核对主工作区流程

1. 在 `AGENTS.md` 确认主工作区位于 `main`、保持干净、只运行 fetch 与 pull，全部变更位于 worktree。
2. 在 worktree 创建说明中确认 Spec Kit 流程最前的 `/speckit-specify` 前同步、停止条件与结果输出。
3. 在 worktree 结束说明中确认 Spec Kit 流程最后的交付与放弃清理阶段均包含同步。
4. 确认 `.dsh/skills/` 与 `.specify/extensions/worktree/commands/` 的对应说明一致。

## 4. 运行质量门禁

```sh
pnpm format && pnpm check
```

预期：格式化完成，类型检查、lint 与源码测试全部通过。

## 5. 核对范围

```sh
git status --short
git diff --check
```

预期：变更仅涉及本 feature、宪章、项目文档与流程说明；没有空白错误、运行时源码或脚本改动。
