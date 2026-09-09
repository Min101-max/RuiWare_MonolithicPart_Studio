"""Rule-resolution coverage for authored semantic-face source locators."""

from template_core.metamodel import FeatureRule, SemanticFaceDefinition, SemanticFaceLocator
from template_core.rules import evaluate_template


def _single_rule(*face_ids: str) -> FeatureRule:
    return FeatureRule(
        id="hole.located",
        name="来源定位孔",
        featureType="circularHole",
        faceBindings=[{"semanticFaceId": face_id} for face_id in face_ids],
        arguments={"diameter": 8, "x": 0, "z": 10},
    )


def _edge_face(face_id: str, source_entity_id: str) -> SemanticFaceDefinition:
    return SemanticFaceDefinition(
        id=face_id,
        label=face_id,
        hostFrame="positiveY",
        locator={
            "kind": "profileEdge",
            "operationId": "body.main",
            "profileSketchId": "sketch.section.main",
            "sourceEntityId": source_entity_id,
        },
        uStartExpression="-width / 2",
        uSpanExpression="width",
        vStartExpression="5",
        vSpanExpression="length - 10",
    )


def test_resolved_features_keep_distinct_sources_with_the_same_host_frame() -> None:
    faces = [
        _edge_face("part.face.u.inner", "edge.u.inner"),
        _edge_face("part.face.u.outer", "edge.u.outer"),
    ]

    evaluation = evaluate_template(
        [],
        [_single_rule(*(face.id for face in faces))],
        external_context={"width": 80, "length": 1000},
        semantic_faces=faces,
    )

    assert evaluation.success, evaluation.diagnostics
    assert len(evaluation.features) == 2
    by_face = {feature.semanticFaceId: feature for feature in evaluation.features}
    assert {feature.hostFace for feature in evaluation.features} == {"positiveY"}
    assert by_face["part.face.u.inner"].resolvedSourceEntityId == "edge.u.inner"
    assert by_face["part.face.u.outer"].resolvedSourceEntityId == "edge.u.outer"
    assert by_face["part.face.u.inner"].locator == faces[0].locator
    assert by_face["part.face.u.outer"].locator == faces[1].locator
    assert by_face["part.face.u.inner"].resolvedUStart == -40.0
    assert by_face["part.face.u.inner"].resolvedUSpan == 80.0
    assert by_face["part.face.u.inner"].resolvedVStart == 5.0
    assert by_face["part.face.u.inner"].resolvedVSpan == 990.0


def test_missing_locator_warns_but_preserves_legacy_resolution() -> None:
    legacy_face = SemanticFaceDefinition(
        id="part.face.legacy",
        label="旧语义面",
        hostFrame="negativeX",
        uStartExpression="-20",
        uSpanExpression="40",
        vStartExpression="0",
        vSpanExpression="100",
    )

    evaluation = evaluate_template(
        [],
        [_single_rule(legacy_face.id)],
        semantic_faces=[legacy_face],
    )

    assert evaluation.success
    assert len(evaluation.features) == 1
    feature = evaluation.features[0]
    assert feature.semanticFaceId == legacy_face.id
    assert feature.hostFace == "negativeX"
    assert feature.locator is None
    assert feature.resolvedSourceEntityId is None
    assert feature.resolvedUStart == -20.0
    assert feature.resolvedUSpan == 40.0
    assert feature.resolvedVStart == 0.0
    assert feature.resolvedVSpan == 100.0
    warnings = [
        diagnostic
        for diagnostic in evaluation.diagnostics
        if diagnostic.code == "SEMANTIC_FACE_LOCATOR_MISSING"
    ]
    assert len(warnings) == 1
    assert warnings[0].severity == "warning"


def test_invalid_mutated_locator_is_a_rule_resolution_error() -> None:
    face = _edge_face("part.face.invalid", "edge.valid")
    assert face.locator is not None
    face.locator = face.locator.model_copy(update={"sourceEntityId": ""})

    evaluation = evaluate_template(
        [],
        [_single_rule(face.id)],
        external_context={"width": 80, "length": 1000},
        semantic_faces=[face],
    )

    assert not evaluation.success
    assert evaluation.features == []
    assert any(
        diagnostic.code == "SEMANTIC_FACE_LOCATOR_INVALID"
        and diagnostic.path == f"geometryRecipe.semanticFaces.{face.id}.locator"
        for diagnostic in evaluation.diagnostics
    )


def test_single_placement_keeps_working_when_face_bounds_cannot_resolve() -> None:
    face = _edge_face("part.face.single", "edge.single")
    face.uStartExpression = "unknown_u"
    face.uSpanExpression = "'not numeric'"

    evaluation = evaluate_template(
        [],
        [_single_rule(face.id)],
        external_context={"length": 1000},
        semantic_faces=[face],
    )

    assert evaluation.success, evaluation.diagnostics
    assert len(evaluation.features) == 1
    feature = evaluation.features[0]
    assert feature.arguments["x"] == 0.0
    assert feature.locator == face.locator
    assert feature.resolvedUStart is None
    assert feature.resolvedUSpan is None
    assert feature.resolvedVStart == 5.0
    assert feature.resolvedVSpan == 990.0


def test_single_placement_ignores_domain_errors_in_unused_face_bounds() -> None:
    face = _edge_face("part.face.sqrt-domain", "edge.sqrt-domain")
    face.uStartExpression = "sqrt(-1)"

    evaluation = evaluate_template(
        [],
        [_single_rule(face.id)],
        external_context={"width": 80, "length": 1000},
        semantic_faces=[face],
    )

    assert evaluation.success, evaluation.diagnostics
    assert len(evaluation.features) == 1
    assert evaluation.features[0].resolvedUStart is None
    assert evaluation.features[0].resolvedUSpan == 80.0


def test_array_still_requires_numeric_bounds_on_its_placement_axis() -> None:
    face = _edge_face("part.face.array", "edge.array")
    face.vSpanExpression = "unknown_v_span"
    rule = _single_rule(face.id)
    rule.countExpression = "2"
    rule.placement.mode = "equalSpan"
    rule.placement.axis = "v"

    evaluation = evaluate_template(
        [],
        [rule],
        external_context={"width": 80, "length": 1000},
        semantic_faces=[face],
    )

    assert not evaluation.success
    assert evaluation.features == []
    assert any(
        diagnostic.code == "FEATURE_RULE_EVALUATION_FAILED"
        for diagnostic in evaluation.diagnostics
    )


def test_profile_region_locator_is_preserved_in_resolved_feature() -> None:
    locator = SemanticFaceLocator(
        kind="profileRegion",
        operationId="body.main",
        profileSketchId="sketch.section.main",
        sourceEntityId="section.region.main",
        capSide="start",
    )
    face = SemanticFaceDefinition(
        id="part.endFace.start",
        label="起始端面",
        hostFrame="negativeZ",
        locator=locator,
        uStartExpression="-40",
        uSpanExpression="80",
        vStartExpression="-20",
        vSpanExpression="40",
    )

    evaluation = evaluate_template(
        [],
        [_single_rule(face.id)],
        semantic_faces=[face],
    )

    assert evaluation.success, evaluation.diagnostics
    feature = evaluation.features[0]
    assert feature.locator == locator
    assert feature.resolvedSourceEntityId == "section.region.main"
    assert feature.locator.capSide == "start"
