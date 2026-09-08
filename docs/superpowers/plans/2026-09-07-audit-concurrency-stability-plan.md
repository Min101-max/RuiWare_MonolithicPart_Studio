# 第五、六阶段实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 为模板平台补齐统一写入确认/版本上下文、可查询审计、可回滚和 MCP 有限重试，并以回归测试覆盖并发与稳定性要求。

**Architecture:** 在 FastAPI 层解析可选写入上下文，在 Repository 层以 SQLite 事务记录操作审计并执行 revision guard。现有请求字段和 GUI 路由保持兼容；Agent/MCP 写工具显式发送 actor、session、baseRevision 和确认信息。回滚复用现有历史 revision 恢复逻辑生成新 revision，MCP 客户端只对明确可重试的连接/服务错误进行有限退避重试。

**Tech Stack:** Python 3.11+, FastAPI, Pydantic, SQLite, pytest, urllib.request, React/TypeScript, Vitest。

**Spec:** `docs/superpowers/specs/2026-09-07-audit-concurrency-stability-design.md`

## Global Constraints

- 不删除或覆盖现有未提交改动；保持既有 GUI 页面、模板数据结构和 API 路径兼容。
- 所有新增生产行为必须先有一个会失败的测试，再写最小实现。
- 旧 GUI 请求继续可用；Agent 写请求必须显式携带 `actor=agent`、`baseRevision`，需要写入时 `confirmed=true`。
- 审计日志写入现有 SQLite，禁止把完整敏感请求体直接写入日志。
- 重试最多 2 次，仅针对连接错误和 5xx/`retryable=true`；不重试 409、422 或确认失败。
- 所有任务完成后运行完整 Python 测试和前端测试/构建。

### Task 1: 统一写入上下文与错误语义

**Files:**
- Create: `services/template-api/app/services/write_context.py`
- Modify: `services/template-api/app/main.py`
- Modify: `services/template-api/app/errors.py`
- Test: `tests/test_write_context.py`

**Interfaces:**
- Produces `WriteContext(actor: Literal["gui", "agent"], source: str, session_id: str | None, base_revision: int | None, confirmed: bool)` and `parse_write_context(request, body_context=None)`.
- `parse_write_context` reads `X-RuiWare-Actor`, `X-RuiWare-Source`, `X-RuiWare-Session`, `X-RuiWare-Base-Revision`, and `X-RuiWare-Confirmed`, while allowing existing body fields to override absent headers.

- [x] Step 1: Add tests for default GUI context, explicit Agent headers, malformed revision, and unconfirmed Agent write.
- [x] Step 2: Run `pytest tests/test_write_context.py -q`; confirm failure because the parser and new error code do not exist.
- [x] Step 3: Implement the parser and add `WRITE_CONFIRMATION_REQUIRED`/`WRITE_REVISION_REQUIRED` to the existing structured error map without changing old error payload shape.
- [x] Step 4: Run the focused test again and confirm it passes.
- [x] Step 5: Run `pytest tests/test_api_errors.py tests/test_write_context.py -q`.

### Task 2: Repository 审计存储与回滚服务

**Files:**
- Modify: `services/template-api/app/repository.py`
- Modify: `services/template-api/app/services/draft.py`
- Modify: `services/template-api/app/services/operations.py`
- Modify: `services/template-api/app/services/__init__.py`
- Test: `tests/test_audit_and_rollback.py`

**Interfaces:**
- `Repository.record_audit(*, action, actor, source, session_id, draft_id, before_revision, after_revision, confirmed, status, error_code=None, metadata=None) -> dict`.
- `Repository.list_audit(*, draft_id: str | None = None, limit: int = 100) -> list[dict]`.
- `rollback_template_revision(repository, draft_id, target_revision, base_revision, confirmed, context) -> TemplateDraft`.

- [x] Step 1: Add failing tests for audit table persistence, audit ordering, stale rollback rejection, unconfirmed rollback rejection, and successful rollback creating the next revision.
- [x] Step 2: Run `pytest tests/test_audit_and_rollback.py -q`; confirm expected missing-method failures.
- [x] Step 3: Add `operation_audit` schema and repository methods; update rollback service to call `restore_revision` with the current revision guard and write a `rollback` audit entry.
- [x] Step 4: Run the focused tests and confirm they pass.
- [x] Step 5: Run existing revision tests (`pytest tests/test_full_workflow.py tests/test_parameter_assistance.py tests/test_orchestration.py -q`).

### Task 3: API 审计查询、回滚和统一写入审计

**Files:**
- Modify: `services/template-api/app/main.py`
- Modify: `services/template-api/app/services/write_context.py`
- Modify: `services/template-api/app/services/draft.py`
- Test: `tests/test_phase5_api.py`

**Interfaces:**
- `GET /api/v1/audit-logs?draftId=<id>&limit=<n>` returns `{ "items": [...] }`.
- `POST /api/v1/template-drafts/{draft_id}/rollback` accepts `{ "targetRevision": int, "baseRevision": int, "confirmed": bool }` and returns the restored `TemplateDraft`.
- All draft-mutating endpoints call a shared `audit_write_result` helper; missing optional context defaults to `actor="gui"`, while Agent requests without required guard are rejected.

- [x] Step 1: Add failing API tests for audit query, Agent write guard, rollback success/conflict, and compatibility of the existing blank-create endpoint.
- [x] Step 2: Run `pytest tests/test_phase5_api.py -q`; confirm failures.
- [x] Step 3: Add routes, wire context parsing into mutating draft endpoints, and record success/failure audit entries without changing existing response models.
- [x] Step 4: Run focused API tests and confirm they pass.
- [x] Step 5: Run all existing API tests.

### Task 4: MCP 审计、回滚和写入上下文

**Files:**
- Create: `services/ruiware-mcp/ruiware_mcp/tools/read/audit.py`
- Create: `services/ruiware-mcp/ruiware_mcp/tools/workflow/rollback.py`
- Modify: `services/ruiware-mcp/ruiware_mcp/api_client.py`
- Modify: `services/ruiware-mcp/ruiware_mcp/server.py`
- Modify: `services/ruiware-mcp/ruiware_mcp/core/additional_tools.py`
- Modify: `services/ruiware-mcp/ruiware_mcp/core/contracts.py`
- Modify: `services/ruiware-mcp/ruiware_mcp/tools/read/__init__.py`
- Modify: `services/ruiware-mcp/ruiware_mcp/tools/workflow/__init__.py`
- Test: `tests/test_phase5_mcp.py`

**Interfaces:**
- MCP read tool `ruiware_get_audit_log({draftId?, limit?})`.
- MCP write tool `ruiware_rollback_draft({draftId, targetRevision, baseRevision, confirmed})`.
- `RuiWareApiClient.request(..., headers=None, retries=0)` supports context headers; rollback sends `X-RuiWare-Actor=agent` and `X-RuiWare-Source=mcp`.

- [x] Step 1: Add failing tests for tool registration, exact API routes, context headers, rollback response, and read-only audit behavior.
- [x] Step 2: Run `pytest tests/test_phase5_mcp.py -q`; confirm failures.
- [x] Step 3: Implement tools, schemas, dispatch, and client header plumbing.
- [x] Step 4: Run focused MCP tests and existing MCP contract tests.

### Task 5: MCP 有限重试与稳定性单元测试

**Files:**
- Modify: `services/ruiware-mcp/ruiware_mcp/api_client.py`
- Test: `tests/test_mcp_retry.py`

**Interfaces:**
- `RuiWareApiClient` retries at most twice for `URLError`, HTTP 5xx, or API payloads with `retryable=true`; it immediately raises for 409/422 and never retries a non-idempotent write unless the caller explicitly sets `retry_safe=True`.

- [x] Step 1: Add failing tests using a local fake opener for connection retry, 503 retry, 409 no-retry, and write no-retry.
- [x] Step 2: Run `pytest tests/test_mcp_retry.py -q`; confirm failures.
- [x] Step 3: Implement bounded retry with small exponential delays injected through a testable sleep function.
- [x] Step 4: Run focused retry tests and existing MCP tests.

### Task 6: 第六阶段跨层回归测试与文档

**Files:**
- Create: `tests/test_phase6_stability.py`
- Modify: `apps/studio-web/src/features/draft/useDraftWorkspace.test.ts`
- Modify: `docs/CODE-STRUCTURE.md`
- Modify: `docs/DEVELOPMENT.md`

**Interfaces:**
- Tests cover MCP contract, GUI refresh after Agent revision, concurrent stale writes, parameter bounds, sketch degeneration, CAD failure recovery, and disconnect retry.

- [x] Step 1: Add failing integration tests for each listed stability behavior, using existing fixtures and test seams.
- [x] Step 2: Run the new Python and Vitest tests to confirm each failure is behavior-specific.
- [x] Step 3: Add only the minimal missing seams/fixes discovered by the tests.
- [x] Step 4: Run `pytest -q` and `npm --prefix apps/studio-web run test`.
- [x] Step 5: Run `npm --prefix apps/studio-web run build`.
- [x] Step 6: Update both docs with the completed phase status, command evidence, and compatibility notes.

## Final Verification

- [x] Run `pytest -q` and record the total passing count.
- [x] Run `npm --prefix apps/studio-web run test` and `npm --prefix apps/studio-web run build`.
- [x] Run `git diff --check`.
- [x] Run `git status --short` and verify no unrelated file was changed.
