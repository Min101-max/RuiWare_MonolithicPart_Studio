"""目标导向任务编排工具。"""
from __future__ import annotations
from typing import Any
from ...api_client import RuiWareApiClient
from ...core.responses import tool_result

def plan(client: RuiWareApiClient, arguments: dict[str, Any]) -> dict[str, Any]:
    draft_id = arguments.get("draftId", "")
    return tool_result(client.post(f"/template-drafts/{draft_id}/assistant/tasks/plan", {"task": arguments["task"]}))

def execute(client: RuiWareApiClient, arguments: dict[str, Any]) -> dict[str, Any]:
    draft_id = arguments.get("draftId", "")
    return tool_result(client.post(f"/template-drafts/{draft_id}/assistant/tasks/execute", {"task": arguments["task"], "baseRevision": arguments["baseRevision"], "confirmed": arguments.get("confirmed", False), "input": arguments.get("input", {})}))
