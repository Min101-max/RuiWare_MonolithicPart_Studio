"""Create and select a template for the GUI workspace."""
from __future__ import annotations
from typing import Any
from ...api_client import RuiWareApiClient
from ...core.responses import tool_result

def execute(client: RuiWareApiClient, arguments: dict[str, Any]) -> dict[str, Any]:
    name = arguments.get("name", "")
    result = client.post("/template-drafts/create", {"name": name})
    draft = result.get("draft", result)
    draft_id = draft.get("id") if isinstance(draft, dict) else None
    workspace = client.put("/workspace/current-draft", {"draftId": draft_id}) if draft_id else None
    current = client.get("/workspace/current-draft") if draft_id else None
    return tool_result({"draft": draft, "created": result.get("created", True), "idempotent": result.get("idempotent", False), "workspace": current or workspace})
