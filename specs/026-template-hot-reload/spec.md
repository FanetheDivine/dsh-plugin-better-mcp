# Feature Specification: 迁移模板的实机热更新与前端链接规则

**Feature Branch**: `feat/026-template-hot-reload`

**Created**: 2026-11-20

**Status**: Waived

**Input**: User description: "本项目基于模板 dsh-plugin-template 构建。查看模板最近的两个 commit，将相关变更迁移到本项目。" / "我只是将加热更新能力；前端文档顺便改下就行"

**变更类别**: 模板变更

## Open Decisions

无未决项。访谈被用户豁免，全部决策按推荐答案执行。

## Clarifications

### Session 2026-11-20

- 用户豁免访谈：只迁移模板的实机热更新能力，前端链接规则顺手改文档。
- [D-001] 问：模板自带的 `specs/` 产物是否搬入？ → 答：不搬，本次变更只写 `specs/026-template-hot-reload`。理由：模板 spec 绑定模板仓库的编号与分支，本项目历次同步（013、014、023）只迁移受管文件与文档。
- [D-002] 问：实机 profile 是否每轮删除？ → 答：删除。删除前把报告写入 `specs/<NNN>-<name>/real-device-report.md`，需要留证的截图复制到 `.rdt-shots/`。理由：模板把每轮重建作为热更新流程的一部分，本机已有大量 `rdt-*` profile。
- [D-003] 问：是否取消 `pnpm pack` 安装？ → 答：取消，改链接安装。理由：链接安装才能让宿主加载仓库 `dist`，发布内容已由 `tests/package-pack.test.ts` 与 `test:dist` 覆盖。
- [D-004] 问：热更新验证改哪处代码？ → 答：改 `src/tools.ts` 中 `mcp_manage` 的工具说明。理由：本项目没有模板的 `src/demo-tool.ts`，工具说明在 GUI 工具卡片可见。
- [D-005] 问：skill 是否复制 HMR 配置写法？ → 答：不复制，只写搭建步骤、迭代流程与排错，配置写法引用 `docs/development.md`。理由：宪章 III 要求每条信息只有一个归属文档。
- [D-006] 问：装载用例是否检测非链接安装？ → 答：不检测，只把断言语义改为「加载的版本与产物」。理由：`run-test.mjs` 已有版本与 dist 哈希比对，旧 profile 每轮重建。
- [D-007] 问：报告结构是否新增「热更新验证」？ → 答：新增，固定五步并附截图。理由：每轮至少验证一次热更新，结论要显式记录。

## Review Record

- 2026-11-20 | 决策：Waived | 范围：当前完整规格 | 未决项：无 | 风险：访谈未逐条确认，决策按推荐答案执行；`setup-env.sh` 的链接安装与 HMR 补丁需在真实宿主上跑通后合入。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 在同一运行实例中迭代实机验证 (Priority: P1)

维护者保持一个运行中的 web profile 实例，在仓库修改插件代码并重新构建。实例中的插件按新代码工作，前端界面同步更新，宿主进程与会话继续可用，不需要重装插件或重启 GUI。

**Why this priority**: 现有流程每次改动都要重新打包安装并重启，实机验证的迭代成本高于写代码，长会话也会被打断。

**Independent Test**: 启动实机 GUI 并触发一次插件行为；修改插件代码并构建；再次触发同一行为，观察结果按新代码变化、界面无需刷新、宿主进程号与会话不变。

**Acceptance Scenarios**:

1. **Given** web profile 实例正在运行且插件已加载，**When** 仓库构建成功，**Then** 插件在数秒内按新代码工作，宿主进程不重启。
2. **Given** 实例中有进行中的会话，**When** 插件热更新完成，**Then** 会话历史、工作区与连接保持可用。
3. **Given** 前端产物被重新构建，**When** 热更新完成，**Then** 已打开的页面显示新前端行为，无需手动刷新。
4. **Given** 构建产物导入失败，**When** 维护者再次构建成功，**Then** 插件自动恢复可用，失败原因在界面或日志可见。

---

### User Story 2 - 按 skill 走完一轮实机测试 (Priority: P2)

Agent 按实机 skill 操作时，用链接安装搭建 profile、在同一实例中迭代，并在轮次结束时保存报告与截图、删除 profile。失效场景能按排错表定位原因。

**Why this priority**: 模型按 skill 执行；skill 若仍写打包安装与保留 profile，热更新链路不会被用到，临时目录也会累积。

**Independent Test**: 按更新后的 skill 完成一次搭建与迭代，确认步骤中出现的安装方式为链接安装、循环中不含重装与重启，结束后 profile 目录不存在且报告与截图已保存。

**Acceptance Scenarios**:

1. **Given** 维护者执行搭建步骤，**When** 安装插件，**Then** profile 记录链接依赖，宿主加载仓库 `dist`。
2. **Given** profile 已搭建，**When** Agent 修改代码并构建，**Then** Agent 在同一实例中观察新行为，不执行重装或重启。
3. **Given** 一轮实机测试结束，**When** 执行清理步骤，**Then** 报告与截图先保存，profile 随后被删除。
4. **Given** 构建后行为未变化，**When** Agent 查阅排错表，**Then** 能找到原因与处理方式。

---

### User Story 3 - 开发文档写明前端 UI 链接规则 (Priority: P3)

模型开发插件前端时，按开发文档把 `a` 标签写成完整 URL，读者在 Desktop 中点击即可打开目标页面。

**Why this priority**: Desktop 以应用内地址加载前端页面，相对链接指向该应用地址，点击后打不开目标；本仓库已有同类缺陷（鉴权链接）。

**Independent Test**: 打开开发文档的前端章节，读到完整 URL 的要求与原因；按该规则写出的链接在 Desktop 中可点击。

**Acceptance Scenarios**:

1. **Given** 模型按开发文档编写插件前端，**When** 添加指向外部页面的链接，**Then** `href` 是带协议与主机的完整 URL。
2. **Given** 维护者查阅开发文档，**When** 阅读前端章节，**Then** 同时看到要求与 Desktop 的链接行为说明。

### Edge Cases

- 只改 `src` 未构建：实例行为不变，skill 要求构建后再观察。
- 构建失败或热替换导入失败：插件进入失败状态并给出可见错误，修正后再次构建即恢复。
- 仓库路径含 `.dsh` 等点目录：HMR 默认忽略 `**/.*`，监听不到变化；skill 排错表给出处理方式。
- 前端产物轮询有延迟：等待数秒并确认 `dist/client.js` 已更新。
- 同一轮内手工改过 `cordis.patch.yml`：宿主按补丁重新组合，插件可能重载；改动后按新配置重跑用例。
- 宿主升级后 HMR 配置项或链接行为变化：由装载用例与 skill 的版本相关说明暴露。
- 已存在的旧 profile 按打包安装：不迁移，每轮重建。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 实机搭建 MUST 以链接方式安装被测插件，让宿主加载的产物就是仓库当前的构建产物。
- **FR-002**: 实机 profile MUST 启用 HMR 并监听仓库 `dist`；复用已有 profile 且缺少该配置时 MUST 补齐。
- **FR-003**: 仓库构建成功后，运行中的 web profile 实例 MUST 加载新插件代码，无需重装插件或重启宿主。
- **FR-004**: 热更新 MUST 保留宿主进程、会话、工作区与页面连接；前端产物重建后 MUST 在同一页面自动更新。
- **FR-005**: 热更新失败 MUST 在界面或日志中可观察，并在再次构建成功后自动恢复。
- **FR-006**: 实机 skill MUST 给出「改代码 → 构建 → 观察 → 重跑用例」的迭代流程，并写明不重装、不重启。
- **FR-007**: 一轮实机测试结束时 MUST 先保存报告与截图，再删除 profile。
- **FR-008**: 装载用例 MUST 校验宿主加载的版本与产物同仓库一致；不新增按打包副本安装的检测。
- **FR-009**: 实机 skill MUST 在排错文档中覆盖：构建后无变化、点目录被忽略、加载旧产物、前端未更新、补丁手工改动。
- **FR-010**: 实机报告结构 MUST 增加「热更新验证」一节。
- **FR-011**: `docs/development.md` MUST 在前端章节写明：前端 UI 里 `a` 标签的 `href` MUST 使用完整 URL，并说明原因是 Desktop 以应用内地址加载页面，相对链接打不开目标。
- **FR-012**: 发布内容校验 MUST 由仓库测试覆盖，实机流程不再打包安装。
- **FR-013**: 本次变更 MUST 不改插件源码、前端产物与公开 API。
- **FR-014**: 实机 skill MUST 不复制 `docs/development.md` 的 HMR 配置写法，只引用该文档。

### Key Entities

- **web profile 实例**：一个运行中的宿主进程，持有会话、工作区、插件加载图与热更新通道。
- **插件加载源**：宿主实际导入的产物位置；链接安装下即仓库 `dist`。
- **热更新事件**：构建产物变化触发的一次插件替换，带成功或失败结果。
- **实机 profile**：搭建脚本生成的隔离配置、链接安装记录与驱动脚本集合，每轮结束后删除。
- **实机报告**：一轮测试的结论、关键断言、截图与产物路径，保存在仓库 `specs/<NNN>-<name>/`。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 「改源码 → 构建 → 在 GUI 观察」一次循环在一个构建周期内完成，循环中不含重装命令与宿主重启。
- **SC-002**: 连续三次构建后，同一实例仍可完成一次插件调用，会话数量不变。
- **SC-003**: 按 skill 走完一轮，重装与重启出现次数为 0；结束后 profile 目录不存在，报告与截图已保存。
- **SC-004**: 维护者打开 `docs/development.md` 一次即可读到完整 URL 的要求与原因。
- **SC-005**: `pnpm check` 通过，插件源码与前端产物没有变化。

## Assumptions

- 宿主 `0.2.2-rc.3`（`@deepseek-ai/dsh-agent`）支持链接包热替换，并由客户端轮询前端产物。
- 实机脚本按需把宿主安装到 `~/.dsh-local/dsh-<版本>`，全局 `dsh` 保持不变。
- 仓库与 worktree 路径不含点目录，HMR 默认忽略规则不会命中。
- 本机已有的 `rdt-*` profile 不迁移，按每轮重建处理。
- 本次只改 skill、脚本、开发文档、变更记录与 `specs/`，不改 `src/`、`tests/` 与 `dist/`。
