import pytest

from app.errors import ApiError
from app.repository import Repository
from app.services.draft import rollback_template_revision
from app.services.write_context import WriteContext
from template_core.material import RuiWareMaterialLibrary
from template_core.models import TemplateDraft


def test_repository_persists_and_lists_audit_entries(tmp_path):
    repository = Repository(tmp_path / "platform.db", RuiWareMaterialLibrary(tmp_path / "materials.db"))

    entry = repository.record_audit(
        action="parameter.apply",
        actor="agent",
        source="mcp",
        session_id="session-1",
        draft_id="draft-1",
        before_revision=1,
        after_revision=2,
        confirmed=True,
        status="succeeded",
        metadata={"changed": ["length"]},
    )

    assert entry["action"] == "parameter.apply"
    assert entry["actor"] == "agent"
    assert entry["metadata"] == {"changed": ["length"]}
    assert repository.list_audit(draft_id="draft-1")[0]["id"] == entry["id"]


def test_rollback_creates_next_revision_and_audits_operation(tmp_path):
    repository = Repository(tmp_path / "platform.db", RuiWareMaterialLibrary(tmp_path / "materials.db"))
    first = repository.save_draft(TemplateDraft(name="初始"), reason="test")
    second = repository.save_draft(first.model_copy(update={"name": "修改后"}), expected_revision=first.revision, reason="test")

    restored = rollback_template_revision(
        repository,
        second.id,
        target_revision=first.revision,
        base_revision=second.revision,
        confirmed=True,
        context=WriteContext(actor="agent", source="mcp", session_id="s-1", base_revision=second.revision, confirmed=True),
    )

    assert restored.name == "初始"
    assert restored.revision == second.revision + 1
    audit = repository.list_audit(draft_id=second.id)[0]
    assert audit["action"] == "rollback"
    assert audit["afterRevision"] == restored.revision


def test_rollback_rejects_stale_revision_and_missing_confirmation(tmp_path):
    repository = Repository(tmp_path / "platform.db", RuiWareMaterialLibrary(tmp_path / "materials.db"))
    draft = repository.save_draft(TemplateDraft(name="回滚"), reason="test")

    with pytest.raises(ApiError) as raised:
        rollback_template_revision(
            repository,
            draft.id,
            target_revision=draft.revision,
            base_revision=draft.revision - 1,
            confirmed=True,
            context=WriteContext(actor="agent", source="mcp", base_revision=draft.revision - 1, confirmed=True),
        )
    assert raised.value.detail["code"] == "DRAFT_REVISION_CONFLICT"

    with pytest.raises(ApiError) as raised:
        rollback_template_revision(
            repository,
            draft.id,
            target_revision=draft.revision,
            base_revision=draft.revision,
            confirmed=False,
            context=WriteContext(actor="agent", source="mcp", base_revision=draft.revision, confirmed=False),
        )
    assert raised.value.detail["code"] == "WRITE_CONFIRMATION_REQUIRED"
