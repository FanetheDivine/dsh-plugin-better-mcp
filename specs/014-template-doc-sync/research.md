# Research: 同步模板的宪章与主工作区规范

## 宪章基线

- Decision: 保留宿主依赖版本、测试同步、文档结构、质量门禁与公开引用五条原则，版本升为 `3.0.0`。
- Rationale: 删除与重新编号原则属于 MAJOR 修订。五条原则覆盖每个需求都需要核对的长效约束。
- Alternatives considered: 沿用八条原则会让 Constitution Check 继续核对插件机制细节。

## 宿主依赖版本

- Decision: 全部 `@deepseek-ai/dsh-*` 依赖锁定到 `@deepseek-ai/dsh-agent` 的相同确切版本，并以同版本列入 `minimumReleaseAgeExclude`；其他 `@deepseek-ai/*` 依赖与该宿主发布声明的版本一致。
- Rationale: 本仓库以 `dsh-agent` 选择实机测试宿主，现有全部 dsh 子包均为 `0.2.2-rc.3`。
- Alternatives considered: 模板使用 `@deepseek-ai/dsh`，本仓库的包清单没有该直接依赖。

## 规则归属

- Decision: 宿主入口、严格配置与依赖复用写入 `docs/how-it-works.md`；国际化约束写入 `docs/i18n.md`；风险文档只保留链接。
- Rationale: 这些文档分别面向插件机制、国际化资源与风险读者，符合单一事实源规则。
- Alternatives considered: 新增独立文档会拆散现有机制说明与国际化操作步骤。

## 主工作区同步

- Decision: Spec Kit 流程最前在 `/speckit-specify` 前同步，流程最后在 `/speckit-worktree-finish` 清理后同步。Agent 检查主工作区 `main` 与干净状态，执行 `git fetch origin` 和 `git pull --ff-only`，报告提交与更新状态。
- Rationale: 流程说明可以直接约束 Agent，满足本次只修订 spec 与文档的范围。
- Alternatives considered: 模板的 `sync-main.sh` 与配套测试属于脚本实现，本次保持现有脚本。

## 引用同步

- Decision: 更新现行文档中的原则编号；历史 spec 与 CHANGELOG 保留原编号。
- Rationale: 历史产物记录当时的规则，现行文档需要指向当前原则或归属文档。
- Alternatives considered: 全文替换会改写历史上下文。
