"""Rollback a draft to a historical revision."""

from __future__ import annotations

from typing import Any

from ...api_client import RuiWareApiClient
from ...core.responses import tool_result


def execute(client: RuiWareApiClient, arguments: dict[str, Any]) -> dict[str, Any]:
    draft_id = arguments.get("draftId", "")
    headers = {
        "X-RuiWare-Actor": "agent",
        "X-RuiWare-Source": "mcp",
        "X-RuiWare-Base-Revision": str(arguments["baseRevision"]),
        "X-RuiWare-Confirmed": str(arguments.get("confirmed", False)).lower(),
    }
    return tool_result(client.post(
        f"/template-drafts/{draft_id}/rollback",
        {
            "targetRevision": arguments["targetRevision"],
            "baseRevision": arguments["baseRevision"],
            "confirmed": arguments.get("confirmed", False),
        },
        headers=headers,
    ))
