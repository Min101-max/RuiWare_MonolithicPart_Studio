from fastapi.testclient import TestClient
import pytest

import app.main as main
from app.repository import Repository
from template_core.material import RuiWareMaterialLibrary


@pytest.fixture
def guarded_draft(tmp_path, monkeypatch):
    repository = Repository(tmp_path / "platform.db", RuiWareMaterialLibrary(tmp_path / "materials.db"))
    monkeypatch.setattr(main, "repository", repository)
    client = TestClient(main.app)
    first = client.post("/api/v1/template-drafts/blank", json={"name": "Agent 写入守卫"}).json()
    second = client.put(
        f"/api/v1/template-drafts/{first['id']}",
        json={**first, "name": "Agent 写入守卫 R2"},
    ).json()
    return client, second


def _agent_headers(base_revision: int, *, confirmed: bool = True) -> dict[str, str]:
    return {
        "X-RuiWare-Actor": "agent",
        "X-RuiWare-Source": "mcp",
        "X-RuiWare-Base-Revision": str(base_revision),
        "X-RuiWare-Confirmed": str(confirmed).lower(),
    }


@pytest.mark.parametrize(
    ("path_suffix", "payload"),
    [
        ("/stages/templateInfo/complete", {"baseRevision": 1, "confirmed": True}),
        ("/compile", {"baseRevision": 1, "confirmed": True}),
        ("/publish", {"baseRevision": 1, "confirmed": True}),
    ],
)
def test_agent_workflow_actions_reject_stale_revision(guarded_draft, path_suffix, payload):
    client, draft = guarded_draft

    response = client.post(
        f"/api/v1/template-drafts/{draft['id']}{path_suffix}",
        json=payload,
        headers=_agent_headers(1),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "DRAFT_REVISION_CONFLICT"


def test_agent_proposal_apply_rejects_stale_guard_revision(guarded_draft):
    client, draft = guarded_draft
    proposal = {
        "id": "proposal-secure-write",
        "taskType": "parameterRecognition",
        "baseRevision": draft["revision"],
        "summary": "增加安全测试参数",
        "confidence": 1,
        "assumptions": [],
        "requiredConfirmations": [],
        "commands": [{
            "id": "cmd-secure-width",
            "type": "upsertParameter",
            "targetId": "secureWidth",
            "payload": {"id": "secureWidth", "label": "安全宽度", "default": 100},
            "reason": "验证写入守卫",
        }],
    }

    response = client.post(
        f"/api/v1/template-drafts/{draft['id']}/proposals/apply",
        json={"proposal": proposal, "baseRevision": 1, "confirmed": True},
        headers=_agent_headers(1),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "DRAFT_REVISION_CONFLICT"


def test_agent_template_creation_and_workspace_selection_require_confirmation(tmp_path, monkeypatch):
    repository = Repository(tmp_path / "platform.db", RuiWareMaterialLibrary(tmp_path / "materials.db"))
    monkeypatch.setattr(main, "repository", repository)
    client = TestClient(main.app)

    create_response = client.post(
        "/api/v1/template-drafts/create",
        json={"name": "未确认创建", "confirmed": False},
        headers={"X-RuiWare-Actor": "agent", "X-RuiWare-Source": "mcp"},
    )
    draft = client.post("/api/v1/template-drafts/blank", json={"name": "GUI 创建"}).json()
    select_response = client.put(
        "/api/v1/workspace/current-draft",
        json={"draftId": draft["id"], "confirmed": False},
        headers={"X-RuiWare-Actor": "agent", "X-RuiWare-Source": "mcp"},
    )

    assert create_response.status_code == 422
    assert create_response.json()["error"]["code"] == "WRITE_CONFIRMATION_REQUIRED"
    assert select_response.status_code == 422
    assert select_response.json()["error"]["code"] == "WRITE_CONFIRMATION_REQUIRED"

