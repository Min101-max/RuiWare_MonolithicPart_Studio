"""Read operation audit records."""

from __future__ import annotations

from typing import Any

from ...api_client import RuiWareApiClient
from ...core.responses import tool_result


def execute(client: RuiWareApiClient, arguments: dict[str, Any]) -> dict[str, Any]:
    params: dict[str, Any] = {}
    if arguments.get("draftId"):
        params["draftId"] = arguments["draftId"]
    if arguments.get("limit") is not None:
        params["limit"] = arguments["limit"]
    return tool_result(client.get("/audit-logs", params=params))
