# UI Contract: MCP 管理界面

## 入口与选择器

- 保留 `better-mcp-panel`、`better-mcp-modal`、`better-mcp-form` 与 `better-mcp-server-<name>` 测试选择器。
- 侧栏入口与插件详情配置页复用服务器列表和表单行为。
- 新增、编辑和删除确认弹层具有可访问名称、Escape 关闭、焦点圈定与焦点返回。

## 服务器列表

- 列表使用 `ul`/`li` 结构。
- 每行显示名称、来源、简介、状态、连接信息与可用操作。
- 状态点使用 `aria-hidden`，状态文本始终可见。
- 连接错误与清理诊断独占文本区域，支持任意换行。
- 懒加载使用 `role="switch"` 与 `aria-checked`；accessible name 包含服务器名；忙态禁用。
- 其他来源的服务器只显示状态。

## 表单

- 每个字段具有程序化标签；校验错误通过 `aria-invalid` 与 `aria-describedby` 关联。
- 提交无效表单时聚焦首个无效字段，保留全部输入。
- 密钥输入使用 `autoComplete="new-password"`。
- 表单正文可滚动，取消与保存位于固定底部区域。
- 保存与刷新期间通过 `aria-busy` 表示忙态。

## 主题与布局

| 界面 | Token |
| --- | --- |
| 主文本 | `--dsw-alias-label-primary` |
| 次要文本 | `--dsw-alias-label-secondary`、`--dsw-alias-label-tertiary` |
| 页面、输入与弹层 | `--dsw-alias-bg-base`、`--dsw-alias-bg-layer-3`、`--dsw-alias-bg-layer-2` |
| 边框与分隔线 | `--dsw-alias-border-l2`、`--dsw-alias-border-l3`、`--dsw-alias-border-l4` |
| 主按钮与开关 | `--dsw-alias-button-primary-fill`、`--dsw-alias-brand-primary` |
| 成功、警告、失败与空闲 | `--dsw-alias-state-success-primary`、`--dsw-alias-state-warn-primary`、`--dsw-alias-state-error-primary`、`--dsw-alias-state-idle-primary` |
| 遮罩与焦点 | `--dsw-alias-bg-mask-1`、`--dsw-focus-ring-color` |

- 样式类名使用 `better-mcp-` 前缀。
- 主题切换无需刷新。
- 常规与有限桌面宽度下，工具栏和操作区允许换行，长内容允许换行，弹层保留可视边距。
