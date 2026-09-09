"""GUI/Agent 身份、工作区和草稿归属边界测试。"""

from fastapi.testclient import TestClient

import app.main as main
from app.repository import Repository
from template_core.material import RuiWareMaterialLibrary


def _client(tmp_path, monkeypatch) -> TestClient:
    store = Repository(tmp_path / "platform.db", RuiWareMaterialLibrary(tmp_path / "materials.db"))
    monkeypatch.setattr(main, "repository", store)
    return TestClient(main.app)


def test_agent_actor_header_without_token_is_rejected(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)

    response = client.post(
        "/api/v1/template-drafts/blank",
        headers={"X-RuiWare-Actor": "agent"},
        json={"name": "伪造 Agent"},
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"


def test_valid_agent_token_cannot_be_downgraded_to_gui(tmp_path, monkeypatch):
    owner = _client(tmp_path, monkeypatch)
    draft = owner.post("/api/v1/template-drafts/blank", json={"name": "身份降级"}).json()

    import app.security as security
    monkeypatch.setattr(security, "AGENT_OWNER_ID", "another-user")
    response = TestClient(main.app).get(
        f"/api/v1/template-drafts/{draft['id']}",
        headers={
            "Authorization": "Bearer local-agent-token",
            "X-RuiWare-Actor": "gui",
        },
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "DRAFT_ACCESS_FORBIDDEN"


def test_workspace_selection_is_isolated_by_session(tmp_path, monkeypatch):
    first_client = _client(tmp_path, monkeypatch)
    first = first_client.post("/api/v1/template-drafts/blank", json={"name": "会话一"}).json()
    first_client.put("/api/v1/workspace/current-draft", json={"draftId": first["id"]})

    second_client = TestClient(main.app)
    current = second_client.get("/api/v1/workspace/current-draft")

    assert current.status_code == 200
    assert current.json()["draftId"] is None


def test_workspace_key_isolated_by_owner_even_when_session_matches(tmp_path, monkeypatch):
    first = _client(tmp_path, monkeypatch)
    draft = first.post("/api/v1/template-drafts/blank", json={"name": "工作区归属"}).json()
    import app.security as security
    first.cookies.set("ruiware_session", security.signed_session("shared"))
    first.put(
        "/api/v1/workspace/current-draft",
        json={"draftId": draft["id"]},
    )

    monkeypatch.setattr(security, "AGENT_OWNER_ID", "another-user")
    other = TestClient(main.app)
    current = other.get(
        "/api/v1/workspace/current-draft",
        headers={
            "Authorization": "Bearer local-agent-token",
            "X-RuiWare-Session": "shared",
        },
    )

    assert current.status_code == 200
    assert current.json()["draftId"] is None


def test_draft_is_not_readable_from_another_session(tmp_path, monkeypatch):
    owner = _client(tmp_path, monkeypatch)
    draft = owner.post("/api/v1/template-drafts/blank", json={"name": "私有草稿"}).json()

    import app.security as security
    monkeypatch.setattr(security, "AGENT_OWNER_ID", "another-user")
    other = TestClient(main.app)
    response = other.get(
        f"/api/v1/template-drafts/{draft['id']}",
        headers={"Authorization": "Bearer local-agent-token"},
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "DRAFT_ACCESS_FORBIDDEN"
