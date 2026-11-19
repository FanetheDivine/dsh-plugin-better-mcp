# Research

## 面板数据来源

- Decision: 快照只遍历 `settings.servers`，状态仍按名称从宿主管理器读取。
- Rationale: 用户只管理本插件配置；状态读取与名称冲突检查仍需要管理器。
- Alternatives considered: 保留其他来源只读行会违反本次范围；删除管理器读取会丢失连接状态。

## 状态更新

- Decision: 保留 1 秒轮询，删除手动刷新按钮，保留读取失败后的重试按钮。
- Rationale: 轮询已覆盖状态与配置同步，手动刷新重复。
- Alternatives considered: 新增事件推送超出本次 UI 精简范围。

## MCP 图标

- Decision: 使用 VS Code Codicons 的 `mcp` 图标，替换包图标与侧栏图标，删除服务器行图标。
- Rationale: 用户指定 VS Code 图标；同一形状保持入口与插件详情一致。
- Alternatives considered: 保留现有自绘图标不符合要求；引入图标字体增加运行时依赖。

来源：[microsoft/vscode-codicons](https://github.com/microsoft/vscode-codicons)，MIT。

## 侧栏入口布局

- Decision: 侧栏使用 `data-dsh-part="entry"` 外层，窄栏增加 `data-rail="rail"`，按钮固定 36×36；折叠栏按 entry 纵向排列。
- Rationale: 与现有 restart 入口的宿主约定一致，避免全宽按钮破坏图标列。
- Alternatives considered: 只修改图标边距无法向宿主声明紧凑入口语义。

## OAuth 字段

- Decision: HTTP 表单固定 `auth: oauth`，stdio 固定 `auth: none`；删除认证选择器与回调地址字段，保留 scopes 与客户端密钥。
- Rationale: 用户明确固定 HTTP OAuth；同源回环已是默认回调；scopes 对需要显式权限的服务器仍有作用。
- Alternatives considered: 删除 scopes 会使部分服务器无法配置；删除后端固定回调支持会破坏已有配置兼容性。

## 客户端标识备选项

- Decision: 实现可自由输入的自动完成控件。DSH 选项写入空标识并走动态注册；Codex 选项写入 `app_EMoamEEZ73f0CkXaXp7hrann`。
- Rationale: 宿主与插件没有固定 DSH 客户端标识，当前 DSH 行为就是动态注册；Codex 标识已在宿主依赖的 `openai-codex` 实现中核实。
- Alternatives considered: 原生 `datalist` 无法可靠展示空值选项与说明；新增组件库依赖不符合现有控件结构。

控件在聚焦或点击时始终显示两个备选项，支持键盘选择、Escape 关闭与自由输入。备选项向上展开，避免增加表单弹窗的滚动范围。问号说明在悬停和键盘聚焦时显示，以 Figma 为例说明动态注册可能被拒绝。

## 配置页导航

- Decision: 客户端声明 `pluginNavigation` 注入，先用 `openBundle` 选中插件页，再通过该页注册的导航 store 设置 `kind: row` 与 `better-mcp` 行 id。只注册 `plugins.row.config`。
- Rationale: 宿主公开接口没有 `openRow`；导航 store 是页面自身的行选择状态，直接进入内层配置页且无需模拟点击。
- Alternatives considered: 在包详情注册额外面板会产生重复入口；DOM 模拟点击依赖按钮文案与渲染时序。
