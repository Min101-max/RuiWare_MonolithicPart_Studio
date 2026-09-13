# Agent GUI Consistency Implementation Plan

> **For agentic workers:** This plan is implemented inline in the current workspace.

**Goal:** Make GUI writes revision-safe, make MCP engineering-status reads fast, and show concise Agent change summaries without changing existing GUI or MCP workflows.

**Architecture:** GUI sends the revision it currently displays for stage completion, CAD compile, and publish. The API validates that revision before executing. A single API aggregation endpoint supplies the selected draft, stage validations, latest compile, and published versions. Repository saves produce a bounded change summary that is persisted with the event and delivered through the existing SSE channel.

**Tech Stack:** FastAPI, SQLite, Pydantic, React, TypeScript, native EventSource, pytest, Vitest.

**Spec:** User-approved design in the conversation on 2026-09-12.

## Global Constraints

- Preserve existing GUI flows and MCP tool names.
- Reject stale writes with `DRAFT_REVISION_CONFLICT`.
- Do not use periodic polling for synchronization.
- Do not place the complete draft payload in SSE events.
- Keep the current selected-draft workspace behavior unchanged.

### Task 1: Revision-safe GUI actions

**Files:**
- Modify: `apps/studio-web/src/api/client.ts`
- Modify: `apps/studio-web/src/features/draft/useDraftWorkspace.ts`
- Modify: `services/template-api/app/main.py`
- Modify: `services/template-api/app/services/write_context.py`
- Test: `tests/test_agent_write_security.py`

- [ ] Add tests proving GUI stage completion, compile, and publish reject a stale `baseRevision`.
- [ ] Add `baseRevision` to the three GUI API methods and pass the saved draft revision.
- [ ] Make the three API routes require a revision for every actor while keeping Agent confirmation rules.
- [ ] Run the focused security tests and the existing workflow tests.

### Task 2: Aggregated MCP status

**Files:**
- Modify: `services/template-api/app/services/workspace.py`
- Modify: `services/template-api/app/main.py`
- Modify: `services/ruiware-mcp/ruiware_mcp/tools/read/current_draft.py`
- Test: `tests/test_workspace_context.py`

- [ ] Add a failing test for one aggregated engineering-status response.
- [ ] Implement the service with stage validation results and existing compile/version data.
- [ ] Change the MCP reader to call one endpoint and preserve its public result shape.
- [ ] Run MCP and workspace tests.

### Task 3: Change summaries in SSE

**Files:**
- Modify: `services/template-api/app/events.py`
- Modify: `services/template-api/app/repository.py`
- Modify: `apps/studio-web/src/features/draft/draftSyncChannel.ts`
- Modify: `apps/studio-web/src/features/draft/useDraftWorkspace.ts`
- Modify: `apps/studio-web/src/components/layout/WorkspaceShell.tsx`
- Test: `tests/test_draft_events.py`
- Test: `apps/studio-web/src/features/draft/draftSyncChannel.test.ts`

- [ ] Add tests for parameter, rule, sketch, and affected-stage summaries.
- [ ] Compute bounded before/after values during a successful save.
- [ ] Include the summary in the existing `draft.changed` event.
- [ ] Render source, revision transition, changed categories, and affected stages in the existing conflict/notice area.
- [ ] Run the full backend suite, TypeScript compilation, and focused Vitest tests.
