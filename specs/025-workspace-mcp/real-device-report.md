# 实机测试报告：工作区级 MCP

## 环境

- 宿主：DSH `0.2.2-rc.5`。
- 平台：Windows。
- 隔离 profile：`rdt-workspace-mcp-025`。
- 浏览器：本机 Chrome。
- MCP：独立 Node stdio fixture，返回真实 PID、cwd 与 resources。

## 宿主与配置

| 用例 | 结果 | 关键断言 |
| --- | --- | --- |
| M1–M4 | 通过 | 插件激活，`mcp_manage` 与浏览器模块注册，默认配置有效 |
| M5–M6 | 通过 | volatile 写入不重挂插件，删除定义后对账完成 |

## 工作区生命周期

| 用例 | 结果 | 关键断言 |
| --- | --- | --- |
| W0 | 通过 | active 前没有内部实例 |
| W1 | 通过 | active 在 400ms 初始化延迟期间保持等待，仅在 connected 后返回；cwd 正确并注入删除警告 |
| W2 | 通过 | 同工作区两个 Agent 使用同一 PID |
| W3 | 通过 | inactive 保留共享实例，最后 active 引用释放后关闭 |
| W4 | 通过 | 不同工作区使用不同 PID 与各自 cwd |
| W5 | 通过 | 公开资源名解析到当前 Agent 的工作区进程 |
| W6 | 通过 | 切换目录等待清理，Windows 成功删除旧目录 |
| W7 | 通过 | Agent 释放保留实例，配置删除完成最终清理 |
| W8 | 环境阻塞 | Serena 的 uvx Git 依赖获取失败，直接命令不在隔离 profile 的 PATH；最终失败按预期返回错误并恢复 inactive |

## 浏览器

| 用例 | 结果 | 关键断言 |
| --- | --- | --- |
| WUI0 | 通过 | HTTP 隐藏工作区开关，stdio 显示；启用后隐藏 lazy 并显示帮助 |
| WUI1 | 通过 | 主行隐藏“已连接”，显示“连接情况”，全部重连返回 200 |
| WUI2 | 通过 | 删除配置及测试数据成功 |

旧 `mcp-browser-cases.mjs` 的 B0、B4 通过。B1–B3 使用旧侧栏 dialog 与删除确认选择器，不适用于当前界面；WUI0–WUI2 覆盖对应的新增、面板和删除流程。

## 测试发现并修复

- `80e31cc`：注册前复制冻结配置，允许宿主 Schema 解析嵌套 env 与 args。
- `9199542`：通过 `createScope(pluginCtx, agent)` 注册 Agent-local resource providers。

修复后已重跑全部工作区用例。active 连接等待补充后，W0–W7 再次全部通过。W8 记录了 Serena 的隔离环境启动限制，需要在当前 Desktop 的可用 Serena 环境中复验成功路径。

## 产物

profile 中保留：

- `workspace-results.json`
- `workspace-browser-results.json`
- `fixture-processes.jsonl`
- `workspace-cases.mjs`
- `workspace-browser-cases.mjs`
- `shots/workspace-form.png`
- `shots/workspace-row.png`
