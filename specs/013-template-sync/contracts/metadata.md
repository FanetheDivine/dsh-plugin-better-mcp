# Contract: 插件元数据资源

## 文件

| 文件 | 内容 |
| --- | --- |
| `locale/zh.json` | 中文 `meta.title` 与 `meta.description` |
| `locale/en.json` | 英文 `meta.title` 与 `meta.description` |

约束：

- `locale/` 下只放基线语言的 `.json` 资源，文件名即语言 id。
- 两份文件的 `meta` 键集一致。
- `title` 非空且不含换行；`description` 非空。
- 可选 `meta.detail` 指向仓库内 `docs/*.md`，文件必须存在。
- 资源文本不含零宽空格 U+200B 与 BOM U+FEFF。
- 资源内容本次不改动。

## 清单声明

```json
{
  "exports": { "./locale/*.json": "./locale/*.json" },
  "files": ["dist", "cordis.patch.yml", "locale/*.json", "icon.svg", "README.md"]
}
```

## 测试

`tests/metadata.test.ts` 覆盖：

| 断言 | 失败示例 |
| --- | --- |
| 目录只含基线语言文件 | 删掉 `en.json` |
| `meta` 恰含 `title` 与 `description` | 改名为 `name` |
| 各语言键集一致 | 只在中文加字段 |
| 标题单行且非空 | 标题写入换行 |
| 不含禁用字符 | 粘贴带 BOM 的文案 |
| `meta.detail` 指向存在的包内文档 | 写成仓库外路径 |
| `exports` 与 `files` 含元数据声明 | 删除 `exports` 条目 |

## 文档

- 规范单归属 `docs/i18n.md`。
- 宪章原则 VIII 只写约束，不复述文档内容。
- `docs/development.md` 的命令表与测试表列新入口，并链接规范。