# 第五、六阶段：确认、审计、并发与稳定性设计

## 目标

在保持既有 GUI、模板 API 和 MCP 工具兼容的前提下，为所有 Agent/GUI 写操作补齐统一确认与版本语义、可查询审计记录、可回滚能力，并建立覆盖并发、冲突、越界、退化、编译失败和 MCP 断线重试的回归测试。

## 范围与兼容性

- 现有请求中的 `baseRevision`、`confirmed` 字段继续有效，不强制旧 GUI 一次性迁移。
- 新增可选写入上下文：`actor`（`gui` 或 `agent`）、`source`、`sessionId`。
- 服务端仍是唯一写入边界；Repository 负责原子 revision 检查和审计持久化。
- 不新增 GUI 页面；继续复用现有 revision 轮询、冲突提示和工作区选择。

## 组件

1. `WriteContext` 请求模型和解析器：为写路由提供统一操作者上下文。
2. `operation_audit` SQLite 表及 Repository 方法：记录操作、版本、确认、结果和错误。
3. 审计查询接口与 MCP 只读工具：按草稿读取最近操作。
4. 回滚接口与 MCP 写工具：从指定历史 revision 生成新 revision，并记录 `rollback` 操作。
5. MCP 客户端有限重试：仅对连接错误和 5xx/标记 `retryable` 的错误重试；不重试 409 冲突、422 校验或写入确认错误。

## 数据流

```text
GUI / MCP 写请求
  -> WriteContext + baseRevision + confirmed
  -> 领域校验
  -> Repository 原子 revision 检查
  -> 草稿新 revision + operation_audit 同事务写入
  -> GUI 轮询同步 / MCP 返回操作摘要
```

## 错误与回滚

- 版本不一致统一返回 `DRAFT_REVISION_CONFLICT`，并携带当前 revision。
- 未确认写入统一返回现有确认错误码，不写审计成功记录；失败尝试记录为 `failed`。
- 回滚不覆写历史记录，而是以历史 payload 为基础生成新的 revision，保留完整可追溯链。

## 验收标准

- 每个新增写入口都有测试先行的成功、冲突、确认和审计断言。
- 同一草稿并发提交至多一个成功，其他请求收到 revision 冲突。
- 回滚后 revision 单调递增，历史 revision 仍可读取。
- MCP 断线重试次数有限且不会重复提交不可重试写操作。
- 全部 Python 与前端测试通过，现有 API/页面测试无回归。
