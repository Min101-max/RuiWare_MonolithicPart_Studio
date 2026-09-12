from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.repository import Repository, RevisionConflictError
from template_core.material import RuiWareMaterialLibrary
from template_core.models import TemplateDraft
from template_core.sketch_solver import solve_semantic_sketch


def test_concurrent_same_revision_allows_only_one_writer(tmp_path):
    repository = Repository(tmp_path / "platform.db", RuiWareMaterialLibrary(tmp_path / "materials.db"))
    original = repository.save_draft(TemplateDraft(name="并发模板"), reason="test")

    def save(index):
        candidate = original.model_copy(update={"name": f"并发模板-{index}"})
        try:
            return repository.save_draft(candidate, expected_revision=original.revision, reason="concurrent")
        except Exception as error:  # collect both outcomes for the assertion below
            return error

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(save, (1, 2)))

    successes = [item for item in results if not isinstance(item, Exception)]
    conflicts = [item for item in results if isinstance(item, RevisionConflictError)]
    assert len(successes) == 1
    assert len(conflicts) == 1
    assert repository.get_draft(original.id).revision == original.revision + 1


def test_parameter_bounds_and_sketch_degeneracy_remain_deterministic():
    draft = TemplateDraft(name="稳定性校验")
    draft.sketch.entities[2].end = (50, -25)
    draft.sketch.constraints = []
    solved = solve_semantic_sketch(draft)

    assert not solved["valid"]
    assert any(item["code"].startswith("SKETCH_") for item in solved["diagnostics"])
    length = next(item for item in draft.parameterDefinitions if item.id == "length")
    assert length.minimum < length.default < length.maximum


def test_failed_agent_guard_is_audited(tmp_path, monkeypatch):
    repository = Repository(tmp_path / "platform.db", RuiWareMaterialLibrary(tmp_path / "materials.db"))
    monkeypatch.setattr(main, "repository", repository)
    client = TestClient(main.app)
    draft = client.post("/api/v1/template-drafts/blank", json={"name": "失败审计"}).json()

    response = client.post(
        f"/api/v1/template-drafts/{draft['id']}/parameters/apply",
        json={"baseRevision": draft["revision"], "changes": [], "confirmed": True},
        headers={"Authorization": "Bearer local-agent-token", "X-RuiWare-Actor": "agent"},
    )

    assert response.status_code == 422
    entries = client.get(f"/api/v1/audit-logs?draftId={draft['id']}").json()["items"]
    assert entries[0]["status"] == "failed"
