from fastapi.testclient import TestClient
import sys
import app.main as main
from app.repository import Repository
from template_core.material import RuiWareMaterialLibrary

def test_named_template_creation_is_idempotent(tmp_path, monkeypatch):
    store = Repository(tmp_path / "platform.db", RuiWareMaterialLibrary(tmp_path / "unused.db"))
    monkeypatch.setattr(main, "repository", store)
    client = TestClient(main.app)
    name = "接口幂等模板"
    first = client.post("/api/v1/template-drafts/create", json={"name": name})
    second = client.post("/api/v1/template-drafts/create", json={"name": name})
    assert first.status_code == 201 and second.status_code == 201
    a, b = first.json(), second.json()
    assert a["created"] is True
    assert b["created"] is False and b["idempotent"] is True
    assert a["draft"]["id"] == b["draft"]["id"]
    assert b["draft"]["revision"] == 1
    listed = [item for item in client.get("/api/v1/template-drafts").json() if item["name"] == name]
    assert len(listed) == 1
