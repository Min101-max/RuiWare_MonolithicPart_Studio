from fastapi.testclient import TestClient

import app.main as main
from app.repository import Repository
from template_core.material import RuiWareMaterialLibrary


def _client(tmp_path, monkeypatch):
    store = Repository(tmp_path / "platform.db", RuiWareMaterialLibrary(tmp_path / "materials.db"))
    monkeypatch.setattr(main, "repository", store)
    return TestClient(main.app)


def test_task_plan_reports_current_stage_and_actionable_steps(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    draft = client.post("/api/v1/template-drafts/blank", json={"name": "任务编排"}).json()

    response = client.post(
        f"/api/v1/template-drafts/{draft['id']}/assistant/tasks/plan",
        json={"task": "completeCurrentStage"},
    )

    assert response.status_code == 200
    plan = response.json()
    assert plan["baseRevision"] == draft["revision"]
    assert plan["currentStage"] == "templateInfo"
    assert plan["steps"]
    assert all("tool" in item for item in plan["steps"])


def test_task_execution_requires_confirmation_and_current_revision(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    draft = client.post("/api/v1/template-drafts/blank", json={"name": "任务确认"}).json()
    path = f"/api/v1/template-drafts/{draft['id']}/assistant/tasks/execute"

    unconfirmed = client.post(path, json={"task": "fixCurrentErrors", "baseRevision": draft["revision"], "confirmed": False})
    assert unconfirmed.status_code == 422
    assert unconfirmed.json()["error"]["code"] == "TASK_CONFIRMATION_REQUIRED"

    stale = client.post(path, json={"task": "fixCurrentErrors", "baseRevision": draft["revision"] - 1, "confirmed": True})
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "DRAFT_REVISION_CONFLICT"


def test_complete_current_stage_runs_validation_then_advances(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    draft = client.post("/api/v1/template-drafts/blank", json={"name": "阶段完成任务"}).json()
    draft.update({
        "description": "用于验证目标导向阶段编排的完整模板信息。",
        "designIntent": "采用冷弯辊压制造可调截面零件，并在校验通过后由任务编排完成当前阶段。",
        "manufacturingClassification": {"originId": "inHouse", "primaryProcessId": "coldRollForming", "secondaryProcessIds": [], "reviewed": True},
        "geometryPrototypeId": "prototype.openThinWallProfile",
        "owner": "模板工程师",
        "organization": "RuiWare",
        "tags": ["编排测试"],
    })
    draft = client.put(f"/api/v1/template-drafts/{draft['id']}", json=draft).json()
    path = f"/api/v1/template-drafts/{draft['id']}/assistant/tasks"
    plan = client.post(f"{path}/plan", json={"task": "completeCurrentStage"}).json()
    assert plan["canExecute"] is True

    response = client.post(f"{path}/execute", json={"task": "completeCurrentStage", "baseRevision": draft["revision"], "confirmed": True})
    assert response.status_code == 200
    assert response.json()["draft"]["stageStatus"]["templateInfo"] == "complete"


def test_fix_task_dispatches_confirmed_parameter_change(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    draft = client.post("/api/v1/template-drafts/blank", json={"name": "任务修复"}).json()

    response = client.post(
        f"/api/v1/template-drafts/{draft['id']}/assistant/tasks/execute",
        json={
            "task": "fixCurrentErrors",
            "baseRevision": draft["revision"],
            "confirmed": True,
            "input": {"kind": "parameterChanges", "changes": [{"parameterId": "length", "value": 1200}]},
        },
    )

    assert response.status_code == 200
    result = response.json()
    assert result["executed"] is True
    assert result["result"]["draft"]["revision"] == draft["revision"] + 1
    length = next(item for item in result["result"]["draft"]["parameterDefinitions"] if item["id"] == "length")
    assert length["default"] == 1200


def test_publish_readiness_is_read_only(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    draft = client.post("/api/v1/template-drafts/blank", json={"name": "发布检查"}).json()

    response = client.post(
        f"/api/v1/template-drafts/{draft['id']}/assistant/tasks/execute",
        json={"task": "checkPublishReadiness", "baseRevision": draft["revision"], "confirmed": False},
    )

    assert response.status_code == 200
    assert response.json()["executed"] is True
    assert client.get(f"/api/v1/template-drafts/{draft['id']}").json()["revision"] == draft["revision"]
