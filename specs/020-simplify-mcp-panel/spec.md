# Feature Specification: 精简 MCP 管理面板

**Feature Branch**: `feat/020-simplify-mcp-panel`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "面板只管理本插件配置的 MCP；标题改为已配置的 MCP；侧栏只留 MCP 图标；新增入口改名；删除行图标、来源标签与刷新；stdio 优先；HTTP 固定 OAuth；客户端标识提供 DSH 与 Codex 备选并解释 Figma 场景；删除回调地址；保留授权范围。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 集中查看本插件配置 (Priority: P1)

用户从侧栏图标打开面板，只看到本插件配置的服务器，并能直接识别连接状态与可用操作。

**Why this priority**: 面板用于管理本插件配置，其他来源的服务器会混入只读行并干扰管理。

**Independent Test**: 在宿主同时存在本插件服务器与其他来源服务器时打开面板，核对列表、标题、入口和自动更新行为。

**Acceptance Scenarios**:

1. **Given** 宿主存在其他插件注册的服务器，**When** 用户打开面板，**Then** 列表只包含本插件配置的服务器。
2. **Given** 面板已打开，**When** 服务器状态或配置变化，**Then** 列表自动更新且无需刷新按钮。
3. **Given** 中文界面，**When** 用户查看侧栏与面板，**Then** 侧栏只显示图标，面板标题为「已配置的 MCP」，新增按钮为「新增 MCP」。
4. **Given** 任意服务器行，**When** 用户查看名称区域，**Then** 名称前没有图标，名称后没有来源标签。

---

### User Story 2 - 用精简表单新增服务器 (Priority: P2)

用户新增服务器时优先填写本地命令；选择远程传输时直接进入 OAuth 配置，无需选择认证方式或填写回调地址。

**Why this priority**: 本地命令是默认入口，远程服务器统一使用 OAuth，表单只保留需要决策的字段。

**Independent Test**: 打开新增表单，分别提交 stdio 与 HTTP 配置，核对默认项、可见字段与保存结果。

**Acceptance Scenarios**:

1. **Given** 新增表单刚打开，**When** 用户查看传输方式，**Then** stdio 排在首位并默认选中。
2. **Given** 用户选择 HTTP，**When** 表单显示认证相关字段，**Then** 认证固定为 OAuth，没有认证方式与回调地址输入项，授权范围仍可填写。
3. **Given** 用户编辑已有 HTTP 服务器并保存，**When** 保存完成，**Then** 该服务器使用 OAuth，回调地址沿用同源默认值。
4. **Given** 用户编辑已有 stdio 服务器，**When** 保存完成，**Then** 仍按本地命令保存且无需 OAuth。

---

### User Story 3 - 选择兼容的 OAuth 客户端 (Priority: P3)

用户配置远程服务器时，可以从 DSH 与 Codex 备选项中选择客户端身份，也可以输入其他标识，并理解不同选项的适用场景。

**Why this priority**: 部分授权服务器不接受动态注册的客户端，提供已验证的备选身份可减少鉴权失败。

**Independent Test**: 聚焦客户端标识输入框，选择每个备选项并检查保存的标识；打开说明并核对 Figma 示例。

**Acceptance Scenarios**:

1. **Given** HTTP 服务器表单，**When** 用户聚焦客户端标识输入框，**Then** 始终可选择 DSH 与 Codex 两个备选项。
2. **Given** 用户选择 DSH，**When** 保存并发起授权，**Then** 使用动态客户端注册。
3. **Given** 用户选择 Codex，**When** 保存并发起授权，**Then** 使用 Codex 的公开客户端标识。
4. **Given** 用户输入自定义标识，**When** 保存并发起授权，**Then** 使用输入值且不被备选项覆盖。
5. **Given** 客户端标识标签右侧的问号说明，**When** 用户悬停或聚焦问号，**Then** 看到 Figma 不接受 DSH 动态注册客户端、可选择 Codex 的说明。

### Edge Cases

- 没有其他来源服务器时，面板行为不变。
- 状态读取失败时保留错误提示与重试入口。
- 已有配置中的回调地址不再展示或编辑，授权仍使用同源回环地址。
- 已有 HTTP 配置的授权范围在编辑时原样回填。
- 中文与英文界面提供相同字段、备选项和说明。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 面板 MUST 只列出本插件配置的服务器。
- **FR-002**: 面板 MUST 自动反映状态与配置变化，不提供手动刷新按钮。
- **FR-003**: 中文面板标题 MUST 为「已配置的 MCP」，新增按钮 MUST 为「新增 MCP」。
- **FR-004**: 侧栏入口 MUST 只显示 VS Code MCP 图标，悬停提示与无障碍名称 MUST 为「MCP 服务器」。
- **FR-005**: 插件包图标 MUST 使用 VS Code MCP 图标；服务器行 MUST 隐藏图标与来源标签。
- **FR-006**: 新增表单 MUST 将 stdio 列为第一传输方式并默认选中。
- **FR-007**: HTTP 表单 MUST 固定使用 OAuth，不显示认证方式选择器与回调地址输入项。
- **FR-008**: 授权范围 MUST 保留现有编辑、回填与保存行为。
- **FR-009**: 客户端标识 MUST 支持自由输入，并始终提供 DSH 与 Codex 备选项。
- **FR-010**: DSH 备选项 MUST 使用动态客户端注册；Codex 备选项 MUST 使用 Codex 公开客户端标识 `app_EMoamEEZ73f0CkXaXp7hrann`。
- **FR-011**: 客户端标识标签 MUST 提供问号说明，以 Figma 为例解释 DSH 动态注册可能被拒绝、Codex 可作为备选。
- **FR-012**: 删除、重连、懒加载、授权、退出登录与错误重试能力 MUST 保持可用。

### Key Entities *(include if feature involves data)*

- **服务器配置**: 本插件拥有的服务器定义，包含名称、简介、传输方式、连接参数、懒加载与 OAuth 设置。
- **客户端标识备选项**: 名称、显示标签与标识值的组合；DSH 的标识值为空并触发动态注册。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 面板中其他来源服务器、手动刷新按钮、行图标与来源标签的出现数量均为 0。
- **SC-002**: 新增 stdio 服务器所需的选择传输方式操作从 1 次降为 0 次。
- **SC-003**: HTTP 表单减少认证方式与回调地址 2 个字段，授权范围与密钥字段保持可用。
- **SC-004**: 用户聚焦客户端标识后无需输入即可看到 2 个备选项，并可用 1 次选择切换 DSH 或 Codex。
- **SC-005**: 状态或配置变化后，面板在 2 秒内自动显示最新结果。

## Assumptions

- 其他来源的服务器由各自来源管理，本插件面板只读自身配置。
- 删除回调地址输入项只影响表单，已有授权流程继续使用同源回环地址。
- HTTP 配置在界面中统一使用 OAuth；stdio 配置不使用 OAuth。
- DSH 备选项代表当前的动态客户端注册行为。
