# Changelog

## Unreleased

### Fixed

- Turn 结束时按实例池的 active 引用释放工作区实例，修复 active 后同一 Turn 还有后续步骤时进程残留。
- 切换工作目录或目录缺失时，旧工作区没有实例则不再注入「已关闭」提醒。

### Changed

- inactive 与 Turn 结束不再注入 `inactive` 提醒；inactive 的工具结果给出实例关闭、保留、失败或未确认的结果。
- active 提醒说明进程占用、关闭时机、其他 Agent 占用与关闭延迟。