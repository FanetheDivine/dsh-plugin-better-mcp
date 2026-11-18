# Feature Specification: 同步模板的元数据国际化规范与产物测试新鲜度

**Feature Branch**: `chore/013-template-sync`

**Created**: 2026-11-18

**Status**: Draft

**Input**: 查看模板 `dsh-plugin-template` 最新的两个 commit（`2a654dd` 元数据国际化与规范、`93a934f` 产物测试的构建新鲜度），照此优化插件。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 产物测试与构建流程对齐 (Priority: P1)

维护者在没有 `dist` 的干净检出上运行代码质量门禁，门禁只跑源码测试并通过。构建产物过期时，读取产物的测试直接失败，并提示运行构建命令。

**Why this priority**: 当前源码测试与产物测试混在一个入口，测试内部还会隐式触发构建。干净检出、局部改源码、CI 三种场景下行为不一致，产物过期会被静默放过。

**Independent Test**: 删除 `dist` 后运行源码测试入口，应通过；单独运行产物测试入口，应失败并给出构建提示；运行构建命令，应重建产物并在末尾通过产物测试。

**Acceptance Scenarios**:

1. **Given** 干净检出且没有 `dist`，**When** 运行 `pnpm check`，**Then** 类型检查、lint 与源码测试全部通过，过程不读取也不生成 `dist`。
2. **Given** 源码晚于 `dist`，**When** 运行 `pnpm test:dist`，**Then** 测试失败，输出列出过期文件并提示运行 `pnpm build`。
3. **Given** 干净检出且没有 `dist`，**When** 运行 `pnpm build`，**Then** 生成全部发布产物与类型声明，随后自动运行产物测试并通过。
4. **Given** 产物齐全且新于全部构建输入，**When** 运行 `pnpm test:dist`，**Then** 产物测试通过，测试过程不触发构建。

---

### User Story 2 - 元数据国际化规范落地 (Priority: P2)

插件作者修改插件标题或描述时，有一份规范说明资源位置、字段、回退顺序与校验方式，并有测试守住结构、键集与打包声明。

**Why this priority**: 插件已有 `locale/zh.json` 与 `locale/en.json`，但缺测试与规范。改错键名、漏翻译、漏 `exports` 声明都不会被发现，用户会看到英文包名或键名。

**Independent Test**: 删除任一基线语言文件、改错 `meta` 键名、插入零宽空格、或删除 `exports` 声明后运行元数据测试，测试失败并指出问题。

**Acceptance Scenarios**:

1. **Given** 插件仅含 `locale/en.json` 与 `locale/zh.json`，**When** 运行元数据测试，**Then** 目录清单、`meta` 键集、非空标题与描述、单行标题全部通过。
2. **Given** 中英文 `meta` 键集不一致，**When** 运行元数据测试，**Then** 测试失败并指出两份文件的键集合。
3. **Given** 资源含零宽空格 U+200B 或 BOM U+FEFF，**When** 运行元数据测试，**Then** 测试失败。
4. **Given** `package.json` 缺少 `./locale/*.json` 导出或 `files` 未包含 `locale/*.json`，**When** 运行元数据测试，**Then** 测试失败。
5. **Given** `meta.detail` 指向不存在的文件，**When** 运行元数据测试，**Then** 测试失败。

---

### User Story 3 - 文档与变更记录同步 (Priority: P3)

维护者从文档索引能查到国际化规范，从开发文档能查到新的命令入口与测试划分，从 CHANGELOG 能查到本次变更。

**Why this priority**: 命令入口变化与新增规范都需要在文档中体现，否则下一位维护者仍按旧流程操作。

**Independent Test**: 文档索引含国际化条目，开发文档不再出现旧的测试命令，CHANGELOG 记录本次变更，宪章含国际化原则。

**Acceptance Scenarios**:

1. **Given** 文档索引，**When** 查找国际化规范，**Then** 能从 `AGENTS.md` 与开发文档跳转到规范全文。
2. **Given** 开发文档的命令表，**When** 查找测试入口，**Then** 只列出源码测试与产物测试两个入口，并说明构建命令包含产物测试。
3. **Given** 宪章，**When** 查找国际化约束，**Then** 有一条原则列出资源位置、键集一致、打包声明与测试要求。

---

### Edge Cases

- 检出中只有部分产物：缺少任一发布产物时产物测试失败，并列出缺失文件。
- 产物全部存在但均早于构建输入：失败并列出晚于产物的输入。
- 构建输入目录为空或不存在：按缺失产物处理，给出构建提示。
- 源码测试在产物存在且过期时运行：照常通过，不读取 `dist`。
- `meta.detail` 未声明：元数据测试跳过该断言。
- 新增非基线语言资源：目录清单断言列出全部 `locale/*.json`，基线语言之外的文件需要同步更新基线列表。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `pnpm check` MUST 依次运行类型检查、lint 与源码测试，且 MUST NOT 读取或生成 `dist`。
- **FR-002**: `pnpm build` MUST 生成发布产物与类型声明，并在末尾运行产物测试。
- **FR-003**: 仓库 MUST 提供仅运行源码测试与仅运行产物测试的两个入口，产物测试入口 MUST 在产物缺失或过期时失败。
- **FR-004**: 产物测试 MUST 在读取 `dist` 前检查产物新鲜度；判定 MUST 覆盖产物缺失、部分缺失与输入晚于产物三种状态。
- **FR-005**: 新鲜度检查失败信息 MUST 列出缺失或过期的相对路径，并给出重建产物的命令。
- **FR-006**: 产物测试 MUST NOT 在测试内部触发构建。
- **FR-007**: 元数据测试 MUST 断言 `locale` 目录只含基线语言资源文件，文件名即语言 id。
- **FR-008**: 元数据测试 MUST 断言每份资源的 `meta` 恰含 `title` 与 `description`，均为非空字符串，标题不含换行。
- **FR-009**: 元数据测试 MUST 断言各语言的 `meta` 键集一致。
- **FR-010**: 元数据测试 MUST 断言资源不含零宽空格 U+200B 与 BOM U+FEFF。
- **FR-011**: 元数据测试 MUST 在声明 `meta.detail` 时断言其指向包内 `docs/*.md` 文件且文件存在。
- **FR-012**: 元数据测试 MUST 断言 `package.json` 的 `exports` 含 `./locale/*.json`，`files` 含 `locale/*.json`。
- **FR-013**: 仓库 MUST 提供国际化规范文档，覆盖资源位置、字段表、宿主回退顺序、包清单声明、前端字典、新增语言步骤与校验命令。
- **FR-014**: 宪章 MUST 新增国际化原则，约束资源位置、键集一致、打包声明、禁用字符与测试覆盖。
- **FR-015**: 文档索引、开发文档、README 与 CHANGELOG MUST 反映本次新增的规范、命令入口与测试划分。
- **FR-016**: CI 检查 job 的名称 MUST 反映源码测试、构建与产物测试的先后关系。
- **FR-017**: 国际化的既有运行时行为 MUST 保持不变：前端字典注册、槽位语言绑定与元数据文件内容不改动。

### Key Entities

- **元数据资源**: `locale/<语言 id>.json`，含 `meta.title`、`meta.description` 与可选 `meta.detail`。
- **构建输入**: 构建配置、类型配置、包清单与 `src` 下的源码文件。
- **发布产物**: `dist` 下的宿主产物、浏览器产物与类型声明。
- **新鲜度判定**: 由产物集合、输入集合与修改时间比较得出，结果为通过或失败。
- **基线语言**: 元数据与前端字典都必须提供的语言集合，当前为中英文。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 干净检出上运行 `pnpm check` 全程不访问 `dist`，结果通过。
- **SC-002**: 源码修改后运行产物测试，100% 的用例失败并给出构建提示，提示包含重建命令。
- **SC-003**: 运行 `pnpm build` 后立即运行产物测试，全部用例通过且测试不触发额外构建。
- **SC-004**: 对元数据资源施加任一种破坏（删除文件、改键名、插入禁用字符、删除清单声明），元数据测试在 1 秒内失败并指出破坏点。
- **SC-005**: 文档、脚本与 CI 中不再出现已移除的测试入口；新的两个测试入口在命令表中各有一条说明。

## Assumptions

- 基线语言沿用现有的中英文两份资源，不新增语言。
- 插件的前端字典 `src/client/locales.ts` 已满足键集一致，本次不改动运行时行为。
- 不新增依赖；`npm pack --dry-run` 继续作为发布内容的回归手段。
- 宪章新增原则排在现有原则之后，版本按 MINOR 递增。
- 模板的两个 commit 作为对齐基准，具体内容按本插件的产物清单与命名调整。