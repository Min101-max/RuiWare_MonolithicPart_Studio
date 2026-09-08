import json

import pytest

from cad_worker.body_ops import build_body_with_face_map
from cad_worker.geometry import _runtime_locator_diagnostics, execute_plan
from template_core.lowering import lower_to_plan
from template_core.models import CanonicalPlan, TemplateDraft
from template_core.stages import validate_stage

from test_lowering import draft


def _locator_case_check(template: TemplateDraft):
    validation = validate_stage("baseSketch", template)
    return next(
        item for item in validation.checks if item.id == "semantic-face-locator-cases"
    )


def _feature_locator_check(template: TemplateDraft):
    validation = validate_stage("features", template)
    return next(
        item for item in validation.checks if item.id == "semantic-face-locators"
    )


def test_locator_cases_are_checked_for_minimum_nominal_and_maximum() -> None:
    template = TemplateDraft(name="三工况来源定位")
    check = _locator_case_check(template)

    assert check.passed
    assert "最小、标称和最大" in check.message


def test_missing_source_entity_blocks_locator_case_stage() -> None:
    template = TemplateDraft(name="缺失来源边")
    face = template.geometryRecipe.semanticFaces[0]
    assert face.locator is not None
    face.locator.sourceEntityId = "edge.missing"

    check = _locator_case_check(template)

    assert not check.passed
    assert "来源边不存在" in check.message


@pytest.mark.parametrize(
    ("field", "value", "message_fragment"),
    [
        ("operationId", "operation.missing", "不存在的几何操作"),
        ("profileSketchId", "sketch.missing", "未声明的截面草图"),
    ],
)
def test_features_stage_blocks_invalid_locator_references(
    field: str, value: str, message_fragment: str
) -> None:
    template = TemplateDraft(name="特征阶段来源定位引用")
    face = template.geometryRecipe.semanticFaces[0]
    assert face.locator is not None
    face.locator = face.locator.model_copy(update={field: value})

    validation = validate_stage("features", template)
    check = next(
        item for item in validation.checks if item.id == "semantic-face-locators"
    )
    cases_check = next(
        item for item in validation.checks if item.id == "semantic-face-locator-cases"
    )

    assert not check.passed
    assert message_fragment in check.message
    assert not cases_check.passed


def test_reused_boundary_reports_ambiguous_locator_case() -> None:
    template = TemplateDraft(name="多面来源边")
    template.sketch.regions.append(
        template.sketch.regions[0].model_copy(update={"id": "section.region.extra"})
    )

    check = _locator_case_check(template)

    assert not check.passed
    assert "一个定位器命中多个面" in check.message


def test_runtime_zero_and_multiple_supports_block_cad() -> None:
    plan = lower_to_plan(draft(1), {"record": {"code": "Q345"}})
    shape, face_map = build_body_with_face_map(plan.operations[0])
    del shape
    valid_diagnostics = _runtime_locator_diagnostics(plan, face_map)
    assert valid_diagnostics == []

    missing_plan = plan.model_copy(deep=True)
    missing_plan.operations[1].arguments["locator"]["sourceEntityId"] = "edge.missing"
    missing = _runtime_locator_diagnostics(missing_plan, face_map)
    assert any(item.code == "SEMANTIC_FACE_SOURCE_ENTITY_NOT_FOUND" for item in missing)

    ambiguous_map = {source_id: list(supports) for source_id, supports in face_map.items()}
    source_id = plan.operations[1].arguments["locator"]["sourceEntityId"]
    ambiguous_map[source_id].append(ambiguous_map[source_id][0])
    ambiguous_plan = plan.model_copy(deep=True)
    ambiguous = _runtime_locator_diagnostics(ambiguous_plan, ambiguous_map)
    assert any(item.code == "SEMANTIC_FACE_SUPPORT_AMBIGUOUS" for item in ambiguous)


def test_semantic_map_contains_source_and_resolved_support(tmp_path) -> None:
    plan = lower_to_plan(draft(1), {"record": {"code": "Q345"}})
    result = execute_plan(plan, tmp_path)

    assert result.success, result.diagnostics
    artifact = next(item for item in result.artifacts if item.kind == "semanticMap")
    semantic_path = tmp_path / artifact.url.removeprefix("/artifacts/")
    semantic_map = json.loads(semantic_path.read_text(encoding="utf-8"))
    face = next(
        item
        for item in semantic_map["semanticFaces"]
        if item["semanticFaceId"] == "part.face.front"
    )

    assert face["sourceEntityId"] == "edge.bottom"
    assert face["resolvedSupport"]["kind"] == "profileEdge"
    assert face["resolvedSupport"]["supportFace"]["resolved"] is True
    assert len(face["resolvedSupport"]["origin"]) == 3
    assert len(face["resolvedSupport"]["normal"]) == 3
