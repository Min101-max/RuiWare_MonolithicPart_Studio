import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "ruiware-mcp"))

from ruiware_mcp.core.contracts import TOOL_CONTRACTS
from ruiware_mcp.server import McpApplication, TOOLS


class FakeClient:
    def __init__(self):
        self.calls = []

    def get(self, path, **kwargs):
        self.calls.append(("GET", path, kwargs))
        return {"items": [{"action": "rollback"}]}

    def post(self, path, payload, **kwargs):
        self.calls.append(("POST", path, payload, kwargs))
        return {"id": "draft-1", "revision": 3}


def test_audit_and_rollback_tools_are_registered_with_contracts():
    names = {item["name"] for item in TOOLS}
    assert {"ruiware_get_audit_log", "ruiware_rollback_draft"} <= names
    assert TOOL_CONTRACTS["ruiware_get_audit_log"]["read_only"] is True
    assert TOOL_CONTRACTS["ruiware_rollback_draft"]["read_only"] is False


def test_audit_tool_is_read_only_and_rollback_sends_agent_context():
    client = FakeClient()
    app = McpApplication(client)
    audit = app.call_tool("ruiware_get_audit_log", {"draftId": "draft-1", "limit": 5})
    assert json.loads(audit["content"][0]["text"])["items"]
    app.call_tool("ruiware_rollback_draft", {
        "draftId": "draft-1", "targetRevision": 1, "baseRevision": 2, "confirmed": True,
    })
    assert client.calls[0] == ("GET", "/audit-logs", {"params": {"draftId": "draft-1", "limit": 5}})
    method, path, payload, kwargs = client.calls[1]
    assert (method, path) == ("POST", "/template-drafts/draft-1/rollback")
    assert payload == {"targetRevision": 1, "baseRevision": 2, "confirmed": True}
    assert kwargs["headers"]["X-RuiWare-Actor"] == "agent"
    assert kwargs["headers"]["X-RuiWare-Source"] == "mcp"
