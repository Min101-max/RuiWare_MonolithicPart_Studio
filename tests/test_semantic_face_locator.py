"""Contract tests for semantic-face source locators.

These tests intentionally stop at the authored data contract.  CAD topology
resolution is a later concern; a locator must survive draft serialization and
legacy drafts that predate the field must remain readable.
"""

import pytest
from pydantic import ValidationError

from template_core.metamodel import SemanticFaceLocator
from template_core.models import TemplateDraft
from template_core.stages import validate_stage


def _default_faces_by_id(draft: TemplateDraft):
    return {face.id: face for face in draft.geometryRecipe.semanticFaces}


def _locator_check(draft: TemplateDraft):
    validation = validate_stage("baseSketch", draft)
    return next(check for check in validation.checks if check.id == "semantic-face-locators")


def test_default_rectangular_faces_are_bound_to_stable_profile_ids() -> None:
    draft = TemplateDraft(name="默认来源轮廓边")
    faces = _default_faces_by_id(draft)

    expected = {
        "part.face.front": ("profileEdge", "edge.bottom"),
        "part.face.back": ("profileEdge", "edge.top"),
        "part.face.left": ("profileEdge", "edge.left"),
        "part.face.right": ("profileEdge", "edge.right"),
        "part.endFace.start": ("profileRegion", "section.region.main", "start"),
        "part.endFace.end": ("profileRegion", "section.region.main", "end"),
    }
    for face_id, expected_locator in expected.items():
        kind, source_entity_id, *cap_side = expected_locator
        locator = faces[face_id].locator
        assert locator is not None
        assert locator.kind == kind
        assert locator.operationId == "body.main"
        assert locator.profileSketchId == "sketch.section.main"
        assert locator.sourceEntityId == source_entity_id
        assert locator.capSide == (cap_side[0] if cap_side else None)


def test_semantic_face_locator_round_trips_through_template_json() -> None:
    draft = TemplateDraft(name="来源定位器序列化")
    original = _default_faces_by_id(draft)["part.face.front"].locator
    assert original is not None

    payload = draft.model_dump(mode="json")
    encoded = payload["geometryRecipe"]["semanticFaces"]
    front = next(item for item in encoded if item["id"] == "part.face.front")
    assert front["locator"] == {
        "kind": "profileEdge",
        "operationId": "body.main",
        "profileSketchId": "sketch.section.main",
        "sourceEntityId": "edge.bottom",
        "capSide": None,
    }

    restored = TemplateDraft.model_validate_json(draft.model_dump_json())
    restored_locator = _default_faces_by_id(restored)["part.face.front"].locator
    assert restored_locator is not None
    assert restored_locator == original


def test_legacy_draft_without_locator_remains_readable() -> None:
    draft = TemplateDraft(name="无定位器旧草稿")
    payload = draft.model_dump(mode="json")
    for face in payload["geometryRecipe"]["semanticFaces"]:
        face.pop("locator", None)

    restored = TemplateDraft.model_validate(payload)
    assert len(restored.geometryRecipe.semanticFaces) == 6
    assert all(face.locator is None for face in restored.geometryRecipe.semanticFaces)
    assert _locator_check(restored).passed


def test_legacy_draft_without_semantic_faces_remains_readable() -> None:
    draft = TemplateDraft(name="无语义面旧草稿")
    payload = draft.model_dump(mode="json")
    payload["geometryRecipe"].pop("semanticFaces")
    payload["geometryRecipe"]["constructionMode"] = "sweep"
    payload["geometryRecipe"]["operations"][0]["operator"] = "solid.sweep"

    restored = TemplateDraft.model_validate(payload)

    assert len(restored.geometryRecipe.semanticFaces) == 6
    assert all(face.locator is None for face in restored.geometryRecipe.semanticFaces)
    assert _locator_check(restored).passed


@pytest.mark.parametrize(
    ("face_id", "locator_patch", "message_fragment"),
    [
        ("part.face.front", {"operationId": "body.missing"}, "不存在的几何操作"),
        ("part.face.front", {"profileSketchId": "sketch.missing"}, "未声明的截面草图"),
        ("part.face.front", {"sourceEntityId": "section.region.main"}, "已有草图实体"),
        ("part.endFace.start", {"sourceEntityId": "edge.bottom"}, "已有草图区域"),
        ("part.face.front", {"profileSketchId": "sketch.other"}, "未声明的截面草图"),
    ],
)
def test_locator_references_must_resolve_in_the_authored_draft(
    face_id: str,
    locator_patch: dict[str, str],
    message_fragment: str,
) -> None:
    draft = TemplateDraft(name="无效来源定位器")
    face = _default_faces_by_id(draft)[face_id]
    assert face.locator is not None
    face.locator = face.locator.model_copy(update=locator_patch)

    check = _locator_check(draft)
    assert not check.passed
    assert message_fragment in check.message


def test_locator_profile_sketch_must_match_operation_when_operation_declares_one() -> None:
    draft = TemplateDraft(name="来源操作截面不一致")
    operation = draft.geometryRecipe.operations[0]
    operation.profileSketchId = "sketch.other"

    check = _locator_check(draft)
    assert not check.passed
    assert "profileSketchId 与几何操作" in check.message


def test_locator_profile_sketch_must_be_an_operation_source_ref() -> None:
    draft = TemplateDraft(name="来源草图未接入操作")
    operation = draft.geometryRecipe.operations[0]
    operation.profileSketchId = "sketch.section.main"
    operation.sourceRefs = []

    check = _locator_check(draft)
    assert not check.passed
    assert "sourceRefs 引用" in check.message


def test_locator_accepts_a_declared_profile_sketch_id() -> None:
    """The locator contract is not tied to the default sketch name."""
    draft = TemplateDraft(name="自定义截面草图 ID")
    operation = draft.geometryRecipe.operations[0]
    operation.profileSketchId = "sketch.custom"
    operation.sourceRefs = ["sketch.custom"]
    draft.geometryRecipe.sketches = ["sketch.custom"]
    for face in draft.geometryRecipe.semanticFaces:
        assert face.locator is not None
        face.locator = face.locator.model_copy(update={"profileSketchId": "sketch.custom"})

    assert _locator_check(draft).passed


def test_profile_edge_must_be_a_real_section_boundary() -> None:
    draft = TemplateDraft(name="构造线不能作为来源边")
    draft.sketch.entities.append(
        draft.sketch.entities[0].model_copy(
            update={"id": "construction.helper", "construction": True}
        )
    )
    face = _default_faces_by_id(draft)["part.face.front"]
    assert face.locator is not None
    face.locator = face.locator.model_copy(update={"sourceEntityId": "construction.helper"})

    check = _locator_check(draft)
    assert not check.passed
    assert "非构造且非点" in check.message


def test_profile_region_must_be_closed() -> None:
    draft = TemplateDraft(name="开放区域不能作为端面来源")
    draft.sketch.regions[0].closed = False
    face = _default_faces_by_id(draft)["part.endFace.start"]
    check = _locator_check(draft)
    assert not check.passed
    assert "闭合截面区域" in check.message


def test_locator_only_supports_profile_extrusion_operations() -> None:
    draft = TemplateDraft(name="非拉伸来源定位器")
    draft.geometryRecipe.operations[0].operator = "solid.sweep"

    check = _locator_check(draft)
    assert not check.passed
    assert "仅支持来源于拉伸算子" in check.message


def test_locator_supports_region_extrude() -> None:
    draft = TemplateDraft(name="区域拉伸来源定位器")
    draft.geometryRecipe.operations[0].operator = "sketch.region_extrude"

    assert _locator_check(draft).passed


@pytest.mark.parametrize("kind", ["profileEdge", "profileRegion"])
def test_locator_kind_is_restricted_to_supported_profile_sources(kind: str) -> None:
    locator = SemanticFaceLocator(
        kind=kind,
        operationId="body.main",
        profileSketchId="sketch.section.main",
        sourceEntityId="edge.bottom" if kind == "profileEdge" else "section.region.main",
        **({"capSide": "start"} if kind == "profileRegion" else {}),
    )
    assert locator.kind == kind

    with pytest.raises(ValidationError):
        SemanticFaceLocator(
            kind="brepFace",
            operationId="body.main",
            profileSketchId="sketch.section.main",
            sourceEntityId="1",
        )


@pytest.mark.parametrize("field_name", ["faceIndex", "brepFaceIndex"])
def test_locator_rejects_brep_face_index_fields(field_name: str) -> None:
    with pytest.raises(ValidationError):
        SemanticFaceLocator(
            kind="profileEdge",
            operationId="body.main",
            profileSketchId="sketch.section.main",
            sourceEntityId="edge.bottom",
            **{field_name: 0},
        )


def test_profile_region_locator_requires_cap_side() -> None:
    with pytest.raises(ValidationError):
        SemanticFaceLocator(
            kind="profileRegion",
            operationId="body.main",
            profileSketchId="sketch.section.main",
            sourceEntityId="section.region.main",
        )
