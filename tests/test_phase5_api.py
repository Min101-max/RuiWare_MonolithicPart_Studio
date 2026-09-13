from fastapi.testclient import TestClient

import app.main as main
from app.repository import Repository
from template_core.material import RuiWareMaterialLibrary


def test_agent_mutation_requires_revision_and_confirmation_headers(tmp_path, monkeypatch):
    store = Repository(tmp_path / "platform.db", RuiWareMaterialLibrary(tmp_path / "materials.db"))
    monkeypatch.setattr(main, "repository", store)
    client = TestClient(main.app)
    draft = client.post("/api/v1/template-drafts/blank", json={"name": "守卫模板"}).json()

    response = client.post(
        f"/api/v1/template-drafts/{draft['id']}/parameters/apply",
        json={"baseRevision": draft["revision"], "changes": [], "confirmed": True},
        headers={"Authorization": "Bearer local-agent-token", "X-RuiWare-Actor": "agent"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "WRITE_REVISION_REQUIRED"


def test_rollback_endpoint_and_audit_query_are_available(tmp_path, monkeypatch):
    store = Repository(tmp_path / "platform.db", RuiWareMaterialLibrary(tmp_path / "materials.db"))
    monkeypatch.setattr(main, "repository", store)
    client = TestClient(main.app)
    first = client.post("/api/v1/template-drafts/blank", json={"name": "审计模板"}).json()
    changed = dict(first, name="审计模板-修改", revision=first["revision"])
    second = client.put(f"/api/v1/template-drafts/{first['id']}", json=changed).json()

    response = client.post(
        f"/api/v1/template-drafts/{first['id']}/rollback",
        json={"targetRevision": first["revision"], "baseRevision": second["revision"], "confirmed": True},
        headers={
            "X-RuiWare-Actor": "agent",
            "Authorization": "Bearer local-agent-token",
            "X-RuiWare-Base-Revision": str(second["revision"]),
            "X-RuiWare-Confirmed": "true",
        },
    )

    assert response.status_code == 200
    assert response.json()["name"] == "审计模板"
    audit = client.get(f"/api/v1/audit-logs?draftId={first['id']}")
    assert audit.status_code == 200
    assert audit.json()["items"][0]["action"] == "rollback"
    assert audit.json()["items"][0]["actor"] == "agent"


def test_blank_create_remains_compatible(tmp_path, monkeypatch):
    store = Repository(tmp_path / "platform.db", RuiWareMaterialLibrary(tmp_path / "materials.db"))
    monkeypatch.setattr(main, "repository", store)
    response = TestClient(main.app).post("/api/v1/template-drafts/blank", json={"name": "旧接口"})

    assert response.status_code == 201
    assert response.json()["name"] == "旧接口"
