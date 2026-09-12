import asyncio

from app.event_stream import stream_draft_events
from app.repository import Repository
from template_core.material import RuiWareMaterialLibrary
from template_core.metamodel import FeatureRule
from template_core.models import TemplateDraft


def test_saving_a_draft_persists_a_change_event_with_the_same_revision(tmp_path):
    repository = Repository(tmp_path / "platform.db", RuiWareMaterialLibrary(tmp_path / "materials.db"))

    first = repository.save_draft(TemplateDraft(name="事件测试"), reason="manual-save")
    second = repository.save_draft(
        first.model_copy(update={"name": "事件测试 R2"}),
        expected_revision=first.revision,
        reason="parameter-assistance-apply",
    )

    events = repository.list_draft_events(second.id)

    assert [event.revision for event in events] == [1, 2]
    assert events[-1].draft_id == second.id
    assert events[-1].operation == "parameter-assistance-apply"


def test_draft_event_contains_business_change_summary(tmp_path):
    repository = Repository(tmp_path / "platform.db", RuiWareMaterialLibrary(tmp_path / "materials.db"))
    first = repository.save_draft(TemplateDraft(name="差异测试"), reason="create")
    parameter = first.parameterDefinitions[0].model_copy(update={"default": 1200})
    rule = FeatureRule(id="rule-summary", name="差异规则", featureType="circularHole")
    second = repository.save_draft(
        first.model_copy(update={
            "parameterDefinitions": [parameter, *first.parameterDefinitions[1:]],
            "featureRules": [rule],
            "sketch": first.sketch.model_copy(update={"constraintsReviewed": True}),
        }),
        expected_revision=first.revision,
        reason="agent-change",
    )

    event = repository.list_draft_events(second.id)[-1]

    assert event.summary["fromRevision"] == 1
    assert event.summary["toRevision"] == 2
    assert event.summary["parameters"][0]["before"]["default"] == 1000
    assert event.summary["parameters"][0]["after"]["default"] == 1200
    assert event.summary["rules"][0]["id"] == "rule-summary"
    assert event.summary["sketch"]["changed"] is True
    assert "baseSketch" in event.summary["affectedStages"]


def test_sse_stream_formats_a_replayed_committed_draft_change(tmp_path):
    repository = Repository(tmp_path / "platform.db", RuiWareMaterialLibrary(tmp_path / "materials.db"))
    draft = repository.save_draft(TemplateDraft(name="SSE 测试"), reason="create")
    changed = repository.save_draft(
        draft.model_copy(update={"name": "SSE 测试 R2"}),
        expected_revision=draft.revision,
        reason="manual-save",
    )

    class ConnectedRequest:
        async def is_disconnected(self) -> bool:
            return False

    async def read_first_event() -> str:
        stream = stream_draft_events(repository, changed.id, ConnectedRequest(), last_event_id="1")
        try:
            return await anext(stream)
        finally:
            await stream.aclose()

    formatted = asyncio.run(read_first_event())
    assert "event: draft.changed" in formatted
    assert f'id: {changed.revision + 1}' not in formatted
    assert '"revision":2' in formatted
