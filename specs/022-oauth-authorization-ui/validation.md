# Validation: OAuth 授权与待授权提示

**Date**: 2026-11-19

## 自动化检查

| 检查 | 结果 |
| --- | --- |
| `pnpm format` | 通过 |
| `pnpm check` | 13 个测试文件，211 项测试通过 |
| `pnpm build` | 构建成功，5 项产物测试通过 |
| UI/UX 子代理评审 | 无阻塞问题；2 项可访问性建议已修复并回归 |

可访问性修复：

- 侧栏待授权状态的 `title` 与 `aria-label` 包含待授权说明。
- 每台服务器的授权链接包含服务器名。

## 真实宿主

环境：隔离 profile，DSH `0.2.2-rc.3`，本机 Chrome。当前 Desktop `0.2.2-rc.5` 的 npm 安装与 MCP 配置未被覆盖。

### 装载与配置

隔离 profile `rdt-oauth-022-final`：

- M1 插件激活：通过。
- M2 工具表：通过。
- M3 浏览器产物：通过。
- M4 默认配置：通过。
- M5 volatile 写入不重挂：通过。
- M6 删除配置：通过。

### 页面与 Figma

隔离 profile `rdt-oauth-022-fixed`，使用最终 Figma 回调修复：

| 用例 | 结果 |
| --- | --- |
| R1 侧栏入口加载 | 通过 |
| R2 侧栏进入配置面板 | 通过 |
| R3 高亮原生授权链接 | `href`、`target="_blank"`、primary 样式通过 |
| R4 侧栏待授权高亮与呼吸 | `data-attention=true`，`better-mcp-auth-breath` 生效 |
| R5 减少动态效果 | `animation-name: none`，静态提示保留 |
| R6 Figma 授权重定向 | 302 到 `https://www.figma.com/oauth/mcp`，使用动态 client_id 与 `http://127.0.0.1:<系统分配端口>/callback` |
| R7 控制台 | 0 个错误 |

动态回调矩阵实测：

| redirect_uri | DCR 结果 |
| --- | --- |
| `http://127.0.0.1:4322/callback` | 201 |
| `http://127.0.0.1:54321/callback` | 201 |
| `http://127.0.0.1/callback` | 201 |
| `http://127.0.0.1:19876/better-mcp/oauth/callback` | 400 `invalid_redirect_uri` |

最终实现对 `127.0.0.1:0/callback` 监听，由操作系统分配端口。真实 socket 测试验证注册、授权地址和换码上下文使用同一个实际地址。

## 会话目录

真实行为单元测试覆盖：

- 未授权 OAuth 服务器不出现在目录正文或更新说明中。
- 授权完成后全部在线 Agent 立即收到一条包含该服务器的目录。
- 退出登录后目录移除该服务器。
- stdio / `auth: none` 保持现有规则。
- OAuth 成功回调写入 grant 并触发一次目录通知。

## 人工验收

以下步骤需要用户账号和当前 Desktop 配置，未自动执行：

1. 在新建 Web profile `rdt-figma-dynamic-022` 中点击 Figma 授权，完成账号授权回调并确认工具连接。
2. 在当前 Desktop 安装构建产物后，确认默认浏览器打开行为与完整授权流程。
