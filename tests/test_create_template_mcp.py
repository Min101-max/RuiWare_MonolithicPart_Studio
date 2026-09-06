import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "ruiware-mcp"))

from ruiware_mcp.server import McpApplication, TOOLS

class FakeClient:
    def __init__(self): self.calls = []
    def get(self, path):
        self.calls.append(("GET", path, None))
        return {"draftId": "draft-1", "draft": {"id": "draft-1", "name": "测试专用"}}
    def post(self, path, payload):
        self.calls.append(("POST", path, payload))
        return {"draft": {"id": "draft-1", "name": payload["name"], "revision": 1}, "created": True, "idempotent": False}
    def put(self, path, payload):
        self.calls.append(("PUT", path, payload))
        return {"draftId": payload["draftId"]}

def payload(result): return json.loads(result["content"][0]["text"])

def test_create_template_is_registered_and_selects_workspace():
    assert any(tool["name"] == "create_template" for tool in TOOLS)
    client = FakeClient()
    result = payload(McpApplication(client).call_tool("create_template", {"name": "测试专用"}))
    assert result["draft"]["name"] == "测试专用"
    assert result["workspace"]["draft"]["name"] == "测试专用"
    assert client.calls == [("POST", "/template-drafts/create", {"name": "测试专用"}), ("PUT", "/workspace/current-draft", {"draftId": "draft-1"}), ("GET", "/workspace/current-draft", None)]
