# 实机测试报告 dsh-plugin-better-mcp 0.1.1 fix/017-polish-mcp-ui

## 环境

- 宿主版本：`0.2.2-rc.3`
- profile：`rdt-ui-20261119`
- 浏览器：本机 Chrome，由 Playwright `1.65.1` 驱动
- 视口：`1440×1000`、`800×800`
- 主题：系统亮色与暗色

## 后端用例

| 用例 | 结果 | 关键断言 |
| --- | --- | --- |
| M1 插件激活 | PASS | 插件状态为已激活 |
| M2 工具可见 | PASS | 包含 `mcp_manage`，不包含旧管理工具 |
| M3 浏览器产物 | PASS | 客户端模块图包含本插件 |
| M4 默认配置 | PASS | 空配置与服务行为符合契约 |
| M5 volatile 写入 | PASS | 服务器写入后插件实例保持不变 |
| M6 删除定义 | PASS | 配置回空，插件实例保持不变 |

## 浏览器流程

| 流程 | 结果 | 证据 |
| --- | --- | --- |
| B0 页面加载 | PASS | 页面标题为 DeepSeek Harness |
| B1 侧栏入口 | PASS | 弹层包含列表面板与新增入口 |
| B2 新增服务器 | PASS | 服务器行出现，profile 补丁写入定义 |
| B3 删除服务器 | PASS | 删除确认后行移除，补丁定义清除 |
| B4 配置页 | PASS | 插件详情内联面板正常显示 |
| 懒加载与刷新 | PASS | `aria-checked` 随写入切换，刷新完成 |
| 弹层焦点 | PASS | 关闭后返回 MCP 侧栏入口 |
| 新增校验 | PASS | 名称错误关联字段并聚焦名称；stdio 空命令聚焦命令 |
| 保存忙态 | PASS | 保存期间全部字段禁用，保留提交内容 |
| 编辑与嵌套弹层 | PASS | 编辑初始焦点为简介；Escape 只关闭顶层弹层 |
| 亮暗主题 | PASS | 列表、表单、配置页均使用当前主题，文字与控件可辨 |
| 有限宽度 | PASS | `800×800` 下页面与弹层无横向溢出 |
| 脚本错误 | PASS | 浏览器 `pageerror` 为 0 |

## 截图

- 服务器列表：`<profile>/shots/final/list-light.png`、`list-dark.png`
- 新增表单：`<profile>/shots/final/form-light.png`、`form-dark.png`
- 配置页：`<profile>/shots/final/page-light.png`、`page-dark.png`
- 有限宽度：`<profile>/shots/final/list-narrow-*.png`、`form-narrow-*.png`
- 布局与控制台证据：`<profile>/shots/final/evidence.json`

## UI/UX 审查

专家复核未发现阻塞问题。占位符对比度为亮色 `5.80:1`、暗色 `8.03:1`；诊断详情、必填提示、保存忙态、删除说明与懒加载帮助均通过复核。

## 产物

- `<profile>/mcp-browser-results.json`
- `<profile>/gui-run.log`
- `<profile>/shots/`
- `<profile>/test-sessions/`
