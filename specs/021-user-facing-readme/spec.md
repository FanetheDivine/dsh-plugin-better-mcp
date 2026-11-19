# Feature Specification: 面向用户的 README

**Feature Branch**: `docs/021-user-facing-readme`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "优化这个插件的 readme，目前的版本完全没有面对用户"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 判断插件是否适合自己 (Priority: P1)

DSH 用户在插件市场或 npm 页面打开 README，读完开头就知道插件解决什么问题、带来什么好处。

**Why this priority**: README 的开头决定用户是否继续阅读和安装。

**Independent Test**: 只读 README 开头一屏，复述插件用途与主要好处。

**Acceptance Scenarios**:

1. **Given** 用户第一次看到插件，**When** 阅读 README 开头，**Then** 能说出插件的三项能力：面板管理 MCP、一键 OAuth 登录、按需加载工具以节省上下文。
2. **Given** 用户不了解实现，**When** 阅读开头，**Then** 文中不出现内部接口名、事件名或消息格式。

---

### User Story 2 - 从安装到在对话中用上第一台服务器 (Priority: P1)

用户按 README 的快速开始一步步操作，完成安装、添加服务器、必要时授权，并在对话中让模型调用该服务器的工具。

**Why this priority**: 跑通首个服务器是用户获得价值的最短路径。

**Independent Test**: 新用户只看 README，在干净 profile 中完成一台 stdio 服务器和一台需要 OAuth 的 HTTP 服务器的接入。

**Acceptance Scenarios**:

1. **Given** 未安装插件，**When** 按快速开始操作，**Then** 每一步都给出要点击的界面位置或要执行的命令。
2. **Given** 需要登录的 HTTP 服务器，**When** 按 README 操作，**Then** 用户知道在面板点「授权」并在浏览器完成登录。
3. **Given** 服务器已接入，**When** 用户在对话中提出相关需求，**Then** README 已说明模型会自动打开所需服务器，用户无需手动操作。

---

### User Story 3 - 理解懒加载对日常使用的影响 (Priority: P2)

用户理解「懒加载」开关的含义，能决定每台服务器是否开启。

**Why this priority**: 懒加载是插件的核心差异，用户需要知道它何时生效、会带来什么体验变化。

**Independent Test**: 阅读相关章节后，回答「开启与关闭懒加载各有什么效果」和「为什么一轮对话后工具又被收起」。

**Acceptance Scenarios**:

1. **Given** 用户看到面板的懒加载开关，**When** 阅读 README，**Then** 能说出开启时省上下文、关闭时工具一开始就可用。
2. **Given** 用户发现下一轮对话工具被收起，**When** 查阅 README，**Then** 能确认这是预期行为且模型会按需重新打开。
3. **Given** 用户同时开着多个会话，**When** 阅读 README，**Then** 知道各会话互不影响。

---

### User Story 4 - 自助解决常见问题 (Priority: P2)

用户遇到授权失败、服务器连不上或配置写错时，能在 README 找到对应的处理办法。

**Why this priority**: 减少用户因常见问题放弃使用。

**Independent Test**: 针对 Figma 授权被拒、浏览器未弹出授权页、插件加载失败三种情况，在 README 中找到操作步骤。

**Acceptance Scenarios**:

1. **Given** Figma 拒绝授权，**When** 查阅常见问题，**Then** 找到改用 Codex 客户端标识后重试的步骤。
2. **Given** 配置写错导致插件停用，**When** 查阅常见问题，**Then** 找到检查最终配置的命令。
3. **Given** 服务器显示「连接失败」，**When** 查阅常见问题，**Then** 知道查看「连接诊断」并点「重连」。

---

### User Story 5 - 用 YAML 批量或高级配置 (Priority: P3)

熟悉配置文件的用户从 README 的链接进入配置参考文档，直接编辑配置。

**Why this priority**: 少数用户需要面板未提供的字段，例如环境变量、固定回调地址。

**Independent Test**: 只依据字段参考写出一台带环境变量的 stdio 服务器配置并成功加载。

**Acceptance Scenarios**:

1. **Given** 用户需要面板之外的字段，**When** 查阅配置参考，**Then** 每个字段都有适用范围与说明。
2. **Given** 普通用户，**When** 阅读 README，**Then** README 只给出一句说明与链接，完整字段参考位于独立文档。

### Edge Cases

- 用户使用英文界面：README 中引用的界面文案与中文界面一致，英文用户需要能对应到按钮。
- 宿主缺少会话可见性所需服务：README 说明此时全部工具始终可见。
- 用户误删服务器：README 提醒删除会同时清除授权且无法撤销。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: README 开头 MUST 用一两句话说明插件用途，并列出用户可感知的主要好处。
- **FR-002**: README MUST 提供「快速开始」，按顺序覆盖安装、打开面板、添加服务器、授权、在对话中使用。
- **FR-003**: 快速开始 MUST 引用面板中实际显示的按钮与字段名称。
- **FR-004**: README MUST 用用户视角解释懒加载：开关含义、模型自动打开、每轮对话后自动收起、会话之间互不影响。
- **FR-005**: README MUST 说明 OAuth 授权的用户操作，包括授权、重新授权、退出登录以及凭据安全存放。
- **FR-006**: README MUST 提供常见问题，至少覆盖 Figma 授权被拒、授权页未弹出、连接失败、配置错误导致插件停用、令牌失效。
- **FR-007**: 完整的配置字段参考与示例 MUST 移到 `docs/configuration.md`，README 只保留指向它的链接。
- **FR-008**: README MUST 省略实现细节，包括内部事件、消息格式、凭据记录类型、OAuth 协议步骤。
- **FR-009**: 从 README 移除的机制说明 MUST 在 `docs/` 中有归属位置，缺失的内容补到 `docs/how-it-works.md`。
- **FR-010**: README MUST 在末尾链接开发者文档。
- **FR-011**: README 的写法 MUST 遵循项目写作规范。

### Key Entities

- **README**：插件用户阅读的唯一入口文档，随 npm 包发布。
- **开发者文档**：`docs/` 下的工作机制、已知风险与开发说明，承接 README 移出的实现细节。
- **配置参考**：`docs/configuration.md`，YAML 字段与示例。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 新用户只读 README，在 10 分钟内接入第一台 stdio 服务器并在对话中使用。
- **SC-002**: README 开头 5 行内说明插件用途与好处。
- **SC-003**: User Story 4 列出的 3 种问题，每种都能在 README 常见问题中定位到处理步骤。
- **SC-004**: README 正文中内部接口名、事件名与消息格式出现次数为 0。模型工具 `mcp_manage` 作为用户可见名称可以出现。
- **SC-005**: 原 README 中的每条信息都能在新 README 或 `docs/` 中找到归属。

## Clarifications

### Session 2026-11-19

- Q: README 用什么语言？ → A: 中文。
- Q: 完整 YAML 字段参考放在哪里？ → A: 移到 `docs/configuration.md`，README 链接过去。

## Assumptions

- README 保持中文，与仓库其他文档一致。
- 本次只调整文档，插件行为不变。
- 不新增截图，避免引入外部图片地址。
- `mcp_manage` 是模型可见的工具名，用户可能在对话中看到，保留在 README 中。
