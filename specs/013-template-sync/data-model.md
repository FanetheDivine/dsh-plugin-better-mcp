# Data Model: 元数据国际化与产物测试新鲜度

## 产物新鲜度

### BuildInput

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `relative` | string | 相对仓库根的路径，正斜杠 |
| `mtime` | number \| undefined | 修改时间（毫秒），文件不存在时为 `undefined` |

来源：

- 固定文件：`tsdown.config.ts`、`tsconfig.json`、`tsconfig.build.json`、`package.json`。
- 目录：`src/` 下全部文件，递归。

### BuildProduct

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `relative` | string | 相对仓库根的路径 |
| `mtime` | number \| undefined | 修改时间，缺失时为 `undefined` |

清单：

- `dist/index.mjs`：宿主产物。
- `dist/client.js`：浏览器产物。
- `dist/index.d.ts`：宿主类型声明。
- `dist/client/index.d.ts`：浏览器类型声明。

### FreshnessDecision

| 状态 | 条件 | 结果 |
| --- | --- | --- |
| 新鲜 | 全部产物存在，且没有输入晚于最旧产物 | 通过 |
| 产物缺失 | 任一产物 `mtime` 为 `undefined` | 失败，列出缺失路径 |
| 输入过期 | 任一输入 `mtime` 晚于最旧产物 | 失败，列出过期输入 |
| 全部缺失 | 全部产物 `mtime` 为 `undefined` | 失败，只列出缺失路径 |

失败信息固定三行：首行说明，第二行列缺失或过期的相对路径，第三行给出 `pnpm build`。

## 元数据资源

### MetadataFile

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `meta.title` | string | 是 | 非空、单行 |
| `meta.description` | string | 是 | 非空 |
| `meta.detail` | string | 否 | 匹配 `^docs/.+\.md$`，文件存在 |

文件位置：`locale/<语言 id>.json`。当前基线语言：`en`、`zh`。

### ManifestDeclaration

| 字段 | 期望值 |
| --- | --- |
| `exports["./locale/*.json"]` | `./locale/*.json` |
| `files` 成员 | 含 `locale/*.json` |

## 命令契约

| 命令 | 读取 `dist` | 写入 `dist` | 包含测试 |
| --- | --- | --- | --- |
| `pnpm check` | 否 | 否 | `test:code` |
| `pnpm test:code` | 否 | 否 | 源码测试 |
| `pnpm test:dist` | 是 | 否 | 产物测试 |
| `pnpm build` | 是（末尾） | 是 | `test:dist` |
| `pnpm full-check` | 是 | 是 | `check` 后 `build` |

## 状态转换

```text
无产物 --pnpm build--> 产物齐全 --修改 src--> 产物过期 --pnpm build--> 产物齐全
                              |                        |
                              +--pnpm test:dist--> 失败  +--pnpm test:dist--> 通过
```