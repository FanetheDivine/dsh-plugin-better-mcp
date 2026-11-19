# Quickstart: 验证面向用户的 README

## 前置

- 在 worktree 根目录完成 `pnpm install`。

## 检查

1. 读 README 前 5 行，确认能说出用途与三项好处。对应 SC-002。
2. 按快速开始在干净 profile 接入一台 stdio 服务器，并在对话中用上它的工具。对应 SC-001。
3. 在常见问题中分别定位：Figma 授权被拒、连接失败、配置写错导致插件停用。对应 SC-003。
4. 在 README 中搜索 `restrict`、`inject`、`pre-step`、`turn/end`、`system-reminder`、`grant`、`api-key`、`PKCE`，结果为 0。对应 SC-004。
5. 对照 [research.md](./research.md#r3-移出-readme-的内容去向) 的去向表，逐条在目标文档中找到原内容。对应 SC-005。
6. 运行 `pnpm format && pnpm check`，全部通过。
