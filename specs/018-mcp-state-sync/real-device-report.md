# 实机测试报告：MCP 状态与会话同步

## 环境

- 宿主版本：0.2.2-rc.3
- Profile：`rdt-20261119-mcp-state`
- 浏览器：本机 Chrome，由 Playwright 驱动
- MCP 服务器：隔离本地 Streamable HTTP 服务，`initialize` 延迟 1.8–3.5 秒

## 后端用例

| 用例 | 结果 | 关键断言 |
| --- | --- | --- |
| M1–M6 | PASS | 插件激活、工具注册、客户端产物、volatile 写入与删除 |
| S0 | PASS | 延迟连接后注册 `mcp__sync__echo` |
| S1 | PASS | 两个会话分别提交初始目录 |
| S2 | PASS | 配置变化立即进入两个在线会话的 `nextStep`，准入前目录投影保持不变 |
| S3 | PASS | 无变化配置保持原待处理队列 |
| S4 | PASS | 下一步提交最新目录，另一个空闲会话保留待处理目录 |
| S5 | PASS | 可见性变化只注入调用方，下一步出现原生 MCP 工具 |
| S6 | PASS | 连续变化只提交最新目录，中间目录未进入模型历史 |
| S7 | PASS | 删除最后一台服务器后提交空目录 |

结果文件：测试 profile 中的 `state-sync-results.json`。

## 浏览器流程

| 流程 | 结果 | 证据 |
| --- | --- | --- |
| P0 | PASS | 打开真实 GUI 与 MCP 弹窗 |
| P1 | PASS | 保存后显示“连接中”，截图 `mcp-state-connecting.png` |
| P2 | PASS | 同一弹窗自动显示“已连接”和 1 个工具，截图 `mcp-state-connected.png` |
| P3 | PASS | 关闭重开后直接显示“已连接” |
| P4 | PASS | 删除测试服务器并清理配置 |

结果文件：测试 profile 中的 `panel-refresh-results.json`。截图位于该 profile 的 `shots` 目录。

## 发现的问题

未发现插件缺陷。

## 产物

- `state-sync-results.json`
- `panel-refresh-results.json`
- `requests.jsonl`
- 测试 profile 的会话目录与 `shots` 目录
