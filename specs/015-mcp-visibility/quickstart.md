# Quickstart: 按会话管理 MCP 可见性

## 前置

- 在 worktree 根目录执行 `pnpm install`。
- 实机验证按 [real-device-test](../../.dsh/skills/real-device-test/SKILL.md) 准备宿主。

## 自动化

```sh
pnpm format && pnpm check
pnpm build
```

关键用例：

| 用例 | 预期 |
| --- | --- |
| 配置缺 `description` | `resolveConfig` 抛错，指出字段 |
| 配置含 `expose` | 报未知配置键 |
| 插件启用 | 只注册 `mcp_manage`；全部服务器调用 `mcpManager.register` |
| `agent/created` | 懒加载服务器的工具进入该 Agent 的 deny 列表 |
| `mcp_manage` active | 调用方 Agent 的 deny 列表移除该服务器工具，其他 Agent 不变 |
| pre-step 首次 | 追加一条完整目录消息 |
| pre-step 无变化且消息可见 | 不追加 |
| 目录消息移出 surface | 追加完整目录 |
| 可见性变化 | 追加更新消息，含 `mcp__<server>__` 说明 |

## 实机

1. 配置一台懒加载与一台非懒加载服务器，填写简介。
2. 新会话发送任意消息，确认模型上下文出现目录消息，工具列表只含非懒加载服务器的工具。
3. 让模型调用 `mcp_manage` 激活懒加载服务器，确认下一步出现更新消息，模型可直接调用其工具。
4. 在另一个会话确认该服务器的工具仍不可见。
5. 执行会话压缩，确认下一步重新出现目录消息。
6. 切换中英文，核对插件页与面板文案。
