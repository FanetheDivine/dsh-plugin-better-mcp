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
| 时机 | 创建 worktree 前、清理 worktree 后 |
| 同步方式 | fast-forward 到 `origin/main` |
| 输出 | 同步后的提交、是否更新 |
| 停止条件 | 分支不符、工作区脏、历史分叉或网络失败 |
