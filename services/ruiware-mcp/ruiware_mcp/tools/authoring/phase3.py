"""第三阶段草图与材料辅助工具。"""
from __future__ import annotations
from typing import Any
from ...api_client import RuiWareApiClient
from ...core.responses import tool_result

def search_materials(client: RuiWareApiClient, arguments: dict[str, Any]) -> dict[str, Any]:
    return tool_result(client.post("/materials/search", {"search": arguments.get("search", ""), "limit": arguments.get("limit", 100), "requirement": arguments.get("requirement")}))

def preview_sketch(client: RuiWareApiClient, arguments: dict[str, Any]) -> dict[str, Any]:
    draft_id = arguments.get("draftId", "")
    return tool_result(client.post(f"/template-drafts/{draft_id}/sketch/preview", {"baseRevision": arguments["baseRevision"], "changes": arguments.get("changes", {})}))

def apply_sketch(client: RuiWareApiClient, arguments: dict[str, Any]) -> dict[str, Any]:
    draft_id = arguments.get("draftId", "")
    return tool_result(client.post(f"/template-drafts/{draft_id}/sketch/apply", {"baseRevision": arguments["baseRevision"], "changes": arguments.get("changes", {}), "confirmed": arguments.get("confirmed", False)}))

def preview_material(client: RuiWareApiClient, arguments: dict[str, Any]) -> dict[str, Any]:
    draft_id = arguments.get("draftId", "")
    return tool_result(client.post(f"/template-drafts/{draft_id}/material-binding/preview", {"baseRevision": arguments["baseRevision"], "sourceRecordId": arguments["sourceRecordId"], "mode": arguments.get("mode", "copy"), "role": arguments.get("role", "nominal")}))

def apply_material(client: RuiWareApiClient, arguments: dict[str, Any]) -> dict[str, Any]:
    draft_id = arguments.get("draftId", "")
    return tool_result(client.post(f"/template-drafts/{draft_id}/material-binding/apply", {"baseRevision": arguments["baseRevision"], "sourceRecordId": arguments["sourceRecordId"], "mode": arguments.get("mode", "copy"), "role": arguments.get("role", "nominal"), "confirmed": arguments.get("confirmed", False)}))
