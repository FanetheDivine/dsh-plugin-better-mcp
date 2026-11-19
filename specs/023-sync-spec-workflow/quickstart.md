# 验证指南：同步 Spec Kit 访谈与审查流程

## 前置条件

- 当前分支为 `feat/023-sync-spec-workflow`。
- 工作区包含本功能规格、计划与任务文档。
- 已安装仓库依赖。

## 内容核验

1. 对照模板提交 `03c8e9e` 审查五个核心 skill、两个模板与两个 manifest。
2. 确认 specify 固定进入 clarify，clarify 与 plan 都在探索后分批访谈。
3. 确认 plan、tasks 与 implement 的阶段门禁符合 [workflow.md](./contracts/workflow.md)。
4. 确认 `AGENTS.md` 与 `docs/development.md` 保留本仓库项目专有内容。

预期：九个受管文件与模板提交一致，项目文档只包含通用 Spec Kit 规则变化。

## 摘要核验

运行：

```sh
sha256sum .dsh/skills/speckit-*/SKILL.md .specify/templates/*.md
```

对照 `.specify/integrations/dsh.manifest.json` 与 `.specify/integrations/speckit.manifest.json`。

预期：所有受管文件的摘要匹配，未修改文件的摘要保持原值。

## 场景核验

按 [workflow.md](./contracts/workflow.md) 检查以下场景：

1. 规格没有未决标记时仍进入需求访谈。
2. 规格未批准或未豁免时，plan 不运行 setup。
3. 计划未批准或未豁免时，tasks 不运行 setup。
4. 实现出现新未决项时，受影响工作暂停并返回对应阶段。
5. 用户豁免时，文档记录未确认事项与风险。

预期：五个场景均符合流程契约。

## 质量检查

```sh
git diff --check
pnpm format && pnpm check
pnpm run full-check
```

预期：全部命令以退出码 0 完成，格式化后受管文件摘要仍与清单一致。
