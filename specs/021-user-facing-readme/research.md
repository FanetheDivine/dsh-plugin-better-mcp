# Research: 面向用户的 README

## R1 README 结构

- Decision: 按用户任务排序：简介与好处 → 快速开始 → 日常使用（面板、懒加载、授权）→ 常见问题 → 更多文档。
- Rationale: 用户先判断是否需要，再求跑通，最后才查细节。
- Alternatives considered: 沿用按模块分节（功能、配置、可见性、面板、OAuth），读者需要自己拼出操作流程。

## R2 配置参考的位置与链接

- Decision: 字段表与 YAML 示例移到 `docs/configuration.md`。README 用 `https://github.com/FanetheDivine/dsh-plugin-better-mcp/blob/main/docs/configuration.md` 链接。
- Rationale: 用户选择移出。`docs/` 不进 npm 包，相对链接在 npm 页面失效，公网地址两处都能打开。
- Alternatives considered: 相对链接，npm 页面上 404。

## R3 移出 README 的内容去向

| 原 README 内容 | 去向 |
| --- | --- |
| 字段表、示例、服务器名规则、透传字段、保存即生效 | `docs/configuration.md` |
| 会话提醒的写入时机表 | `docs/how-it-works.md` 目录消息一节 |
| 空闲会话不自动发起请求 | 已在 `docs/known-risks.md` |
| OAuth 四步流程、回调临时监听 | 已在 `docs/how-it-works.md` OAuth 一节 |
| 凭据记录类型 | 已在 `docs/how-it-works.md` 秘密存放一节 |
| 面板每秒同步 | 已在 `docs/how-it-works.md` 浏览器运行时一节 |
| 只改简介或懒加载时保持连接 | 已在 `docs/how-it-works.md` 挂载一节 |

## R4 界面文案

- Decision: README 引用中文界面实际文案，例如「新增 MCP」「授权」「重连」「连接诊断」「懒加载」。
- Rationale: 文案来自 `src/client/locales.ts`，用户可以按名称找到按钮。英文界面的按钮位置相同。
