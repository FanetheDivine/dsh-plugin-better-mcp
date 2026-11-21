# 实机测试报告：工作区级 MCP 释放

## 环境

- 宿主：DSH `0.2.2-rc.5`，全局安装。
- 平台：Windows。
- 隔离 profile：`rdt-027-workspace-lifetime`，由 `real-device-test` skill 的 `setup-env.sh` 搭建，插件以链接方式安装当前 worktree。
- 模型：skill 自带的 mock provider。
- MCP：可报告 PID 与 cwd 的 stdio fixture。

驱动脚本与 fixture 见 [real-device/](./real-device/)。复制到 profile 目录后运行 `node lifetime-cases.mjs`，需要 `RDT_REPO`。

## 用例

| 用例 | 结果 | 关键断言 |
| --- | --- | --- |
| L0 | 通过 | 工作区级 fixture 配置生效，active 前没有实例 |
| L5 | 通过 | active 后同一 Turn 再调用 fixture 工具，Turn 结束后实例注销，全部 fixture 进程退出 |
| L1 | 通过 | 单 Agent 在 Turn 内 active，Turn 结束后进程退出；只有 active 提醒，没有 inactive 提醒 |
| L2 | 通过 | 另一个 Agent 保持 active 时，当前 Agent 的 Turn 结束保留进程；最后一个引用 inactive 后进程退出 |
| L3 | 通过 | inactive 结果第二行分别给出 `retained` 与 `closed` 的说明，不注入 inactive 提醒 |
| L4 | 通过 | Turn 结束关闭后，Windows 可删除该工作区目录 |

## 修复前对照

用修复前的源码重新构建后运行同一脚本：

| 用例 | 结果 | 说明 |
| --- | --- | --- |
| L1 单独运行 | 通过 | active 选择仍在待定表时，旧逻辑能释放 |
| L5 | 失败 | active 之后还有工具调用步骤，Turn 结束后实例一直注册，进程不退出 |
| L2–L4 | 失败 | L5 遗留的实例连带影响；L3 另因旧 inactive 结果没有实例结果行 |

L5 复现了用户报告的 Serena 进程残留。修复后同一脚本全部通过。

## 观察

- SDK 每次连接先启动一个版本协商用的 sibling 进程，再启动会话进程，fixture 日志中每次 active 有两条 start。
- Windows 上 SDK 以 TerminateProcess 结束子进程，fixture 的 exit 回调来不及写日志。脚本以系统进程表判断存活。
