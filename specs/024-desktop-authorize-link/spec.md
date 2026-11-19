# Feature Specification: 桌面端授权链接

**Feature Branch**: `fix/024-desktop-authorize-link`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "在桌面端使用 点击“授权”根本没反应 但是 web profile 实测是好的"

## Open Decisions

- [ ] [D-001] 桌面端点击授权后，授权页在系统的默认浏览器打开，还是在桌面应用内的浏览窗口中打开 | Depends on: none | Status: not asked
- [ ] [D-002] 授权链接是否必须提供可复制、可访问的完整地址 | Depends on: none | Status: not asked
- [ ] [D-003] 桌面端与 web 是否共用同一授权入口、同一文案与同一交互 | Depends on: D-001 | Status: not asked
- [ ] [D-004] 授权地址尚未就绪时，入口显示准备状态并阻止导航，还是保持可点击 | Depends on: none | Status: not asked
- [ ] [D-005] 验收是否必须包含打包后的桌面应用实机验证 | Depends on: none | Status: not asked

## Clarifications

### Session 2026-11-19

（待确认）

## Review Record

- 2026-11-19 | Decision: pending | Scope: current full document | Open items: D-001, D-002, D-003, D-004, D-005 | Risks: 桌面端外链行为由宿主实现，宿主升级可能改变行为

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 桌面端点击授权打开授权页 (Priority: P1)

桌面应用用户在配置面板点击“授权”，默认浏览器打开授权页，用户完成登录后回到应用，面板显示已授权。

**Why this priority**: 当前桌面端点击没有任何反馈，授权无法开始，OAuth 服务器上的全部工具都不可用。

**Independent Test**: 在打包桌面应用中为待授权 OAuth 服务器点击授权链接，确认默认浏览器打开授权页；完成登录后确认面板显示已授权。

**Acceptance Scenarios**:

1. **Given** 桌面应用中有待授权的 OAuth 服务器，**When** 用户点击授权链接，**Then** 默认浏览器打开该服务器的授权页。
2. **Given** 授权页已在默认浏览器打开，**When** 用户完成登录并回调，**Then** 面板显示该服务器已授权且工具可用。
3. **Given** 同一服务器已完成授权，**When** 用户点击重新授权，**Then** 默认浏览器再次打开授权页。

---

### User Story 2 - web 端保持现有授权体验 (Priority: P1)

web profile 用户在浏览器中点击授权，授权页按现有方式打开，授权流程与回调行为保持不变。

**Why this priority**: 修复桌面端不得回归 web 端已经验证通过的流程。

**Independent Test**: 在 web profile 中重复一次成功授权，确认授权页打开方式、回调与面板状态与修复前一致。

**Acceptance Scenarios**:

1. **Given** web profile 中存在待授权 OAuth 服务器，**When** 用户点击授权链接，**Then** 授权页按现有方式打开。
2. **Given** 授权完成，**When** 回调页返回，**Then** 面板状态与回调页行为保持现有结果。

---

### User Story 3 - 授权链接地址可复制可访问 (Priority: P2)

用户通过右键复制授权链接，把地址粘贴到浏览器或另一个窗口，仍能进入授权页。

**Why this priority**: 复制出的地址可用于排查，也是跨端一致性的直接检验。

**Independent Test**: 在桌面端与 web 端分别复制授权链接地址，粘贴到浏览器地址栏，确认进入授权页。

**Acceptance Scenarios**:

1. **Given** 待授权服务器显示授权链接，**When** 用户复制链接地址，**Then** 地址是可直接访问的完整地址。
2. **Given** 已复制的授权地址，**When** 用户在其他窗口打开它，**Then** 进入授权页并进入等待回调状态。

---

### User Story 4 - 授权地址就绪前不产生无效导航 (Priority: P2)

面板刚打开、状态尚未就绪时，授权入口显示准备状态，用户点击不会得到空白页或静默失败。

**Why this priority**: 无效点击会让用户误以为授权已损坏。

**Independent Test**: 在状态返回前渲染面板，检查授权入口的显示与点击结果；状态就绪后确认入口可用。

**Acceptance Scenarios**:

1. **Given** 授权地址尚未就绪，**When** 用户查看授权区域，**Then** 显示可理解的准备状态。
2. **Given** 授权地址尚未就绪，**When** 用户点击授权入口，**Then** 不产生导航。
3. **Given** 授权地址已就绪，**When** 用户点击授权入口，**Then** 按 User Story 1 或 User Story 2 打开授权页。

---

### Edge Cases

- 桌面端授权页已打开时用户重复点击：允许再次进入授权页，且回调只更新发起本次授权的服务器。
- 默认浏览器被系统策略禁用或没有可用浏览器：用户看到可理解的失败信息与重试方式。
- 授权页打开时服务器被删除或改名：回调不得把授权结果写入其他服务器。
- 启动授权失败：授权页显示失败原因，面板保留可再次点击的授权入口。
- 用户已在另一窗口完成授权：面板在状态刷新后显示已授权。
- 用户在授权过程中关闭浏览器窗口：面板保留待授权状态，用户可以再次点击。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST 在桌面应用中把授权入口的点击交给系统默认浏览器打开授权页。
- **FR-002**: System MUST 保持 web profile 的授权入口、打开方式与回调行为不变。
- **FR-003**: System MUST 把授权入口渲染为链接，保留真实地址、键盘激活与复制地址能力。
- **FR-004**: System MUST 向宿主提供可被默认外链行为接受的完整授权地址，使桌面端与 web 端行为一致。
- **FR-005**: System MUST 在授权地址就绪前显示准备状态，并阻止导航。
- **FR-006**: System MUST 在授权启动失败时保留可再次点击的授权入口与可理解的失败原因。
- **FR-007**: System MUST 让桌面端与 web 端使用同一套授权入口、文案与交互。
- **FR-008**: System MUST 在授权完成后按现有行为关闭成功回调页并更新面板。
- **FR-009**: System MUST 保证一次授权回调只更新发起该次授权的服务器。
- **FR-010**: System MUST 保持无需 OAuth 的服务器与其他面板操作行为不变。

### Key Entities

- **授权链接**: 指向一次授权流程的地址，具有准备中、可打开与失效状态。
- **MCP 服务器**: 具有连接方式、OAuth 要求、授权状态与连接状态。
- **桌面宿主**: 承载配置面板的客户端，决定链接点击的打开方式。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 在打包桌面应用中，待授权服务器从点击授权到授权页可见的成功率为 100%。
- **SC-002**: 桌面端上授权链接的可见点击反馈时延低于 1 秒。
- **SC-003**: web profile 的授权流程回归通过率为 100%，回调与面板结果与修复前一致。
- **SC-004**: 复制授权链接得到的地址在浏览器中可访问的比例为 100%。
- **SC-005**: 键盘用户可以定位并激活全部授权链接，行为与鼠标点击一致。
- **SC-006**: 授权地址就绪前的无效导航次数为 0。
- **SC-007**: 一次授权回调只更新其所属服务器，跨服务器写错次数为 0。

## Assumptions

- 桌面端宿主把完整的 http/https 地址交给系统默认浏览器，同源相对地址不会触发外链。
- 已有桌面安装可复现点击无反应；web profile 的授权流程已由用户实测通过。
- 插件注册的授权启动地址可以被系统浏览器直接访问。
- 本次范围限定授权入口的可用性，不改动授权服务器发现、客户端注册与凭据存储。
- 现有面板的其他操作、会话可见性与凭据存储行为保持不变。
