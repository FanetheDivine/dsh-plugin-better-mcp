# Changelog

## Unreleased

### Added

- `.specify/extensions/worktree/scripts/bash/spec-number-lib.sh`：spec 编号解析与同号分支匹配
- `.specify/extensions/worktree/scripts/bash/check-spec-number.sh`：交付前的编号唯一性校验
- `tests/worktree-extension.test.ts`：占号、自动改号、远程分支同步与交付前校验用例

### Changed

- `/speckit-worktree-create` 在创建 worktree 前同步远程全部分支并推送占号分支，同号时按分支名自动改号
- `/speckit-worktree-finish` 在推送与创建 PR 前校验编号唯一
- MCP 面板改用 DSH 主题变量与插件管理页的列表、控件和弹层结构，亮色与暗色模式均可读
- 服务器列表改为分隔行，状态、诊断、地址与操作各自独立区域；连接诊断默认折叠
- 新增与编辑改为独立表单弹层，校验错误关联到字段并聚焦首个无效字段，保存期间字段只读
- 删除确认改用与宿主一致的确认弹层
- 懒加载开关提供带服务器名称的可访问名称与常驻说明
