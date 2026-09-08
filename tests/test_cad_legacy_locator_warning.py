import json

import cad_worker.feature_ops as feature_ops_module

from cad_worker.body_ops import build_body
from cad_worker.feature_ops import FEATURE_OPERATORS, apply_operation
from cad_worker.geometry import execute_plan
from template_core.lowering import lower_to_plan

from test_lowering import draft


def _legacy_plan(hole_count: int = 2):
    plan = lower_to_plan(draft(hole_count), {"record": {"code": "Q345"}})
    legacy_operation_ids = []
    for operation in plan.operations:
        if operation.operator not in FEATURE_OPERATORS:
            continue
        legacy_operation_ids.append(operation.id)
        operation.arguments.pop("locator", None)
        operation.arguments.pop("resolvedSourceEntityId", None)
        # Older canonical plans only persisted hostFace.
        operation.arguments.pop("hostFrame", None)
    plan.diagnostics = [
        item
        for item in plan.diagnostics
        if item.code != "SEMANTIC_FACE_LOCATOR_MISSING"
    ]
    return plan, legacy_operation_ids


def test_execute_plan_warns_for_each_legacy_host_frame_fallback(tmp_path) -> None:
    plan, legacy_operation_ids = _legacy_plan()

    result = execute_plan(plan, tmp_path)

    assert result.success, result.diagnostics
    warnings = [
        item
        for item in result.diagnostics
        if item.severity == "warning"
        and item.code == "SEMANTIC_FACE_LOCATOR_MISSING"
        and item.path.startswith("operations.")
    ]
    assert [item.path for item in warnings] == [
        f"operations.{operation_id}.arguments.locator"
        for operation_id in legacy_operation_ids
    ]
    assert all("legacy host-frame fallback (negativeY)" in item.message for item in warnings)

    diagnostics_artifact = next(
        item for item in result.artifacts if item.kind == "diagnostics"
    )
    diagnostics_path = tmp_path / diagnostics_artifact.url.removeprefix("/artifacts/")
    persisted = json.loads(diagnostics_path.read_text(encoding="utf-8"))
    assert {
        item["path"]
        for item in persisted
        if item["code"] == "SEMANTIC_FACE_LOCATOR_MISSING"
    } == {item.path for item in warnings}


def test_apply_operation_keeps_legacy_three_argument_call_compatible() -> None:
    plan, _ = _legacy_plan(hole_count=1)
    body = build_body(plan.operations[0])
    feature = next(
        operation
        for operation in plan.operations[1:]
        if operation.operator in FEATURE_OPERATORS
    )

    result = apply_operation(body, feature, 5000.0)

    assert not result.IsNull()


def test_legacy_fallback_accepts_host_frame_without_host_face(monkeypatch) -> None:
    plan, _ = _legacy_plan(hole_count=1)
    body = build_body(plan.operations[0])
    feature = next(
        operation
        for operation in plan.operations[1:]
        if operation.operator in FEATURE_OPERATORS
    )
    selected_frames: list[str] = []
    original_host_point = feature_ops_module._host_point

    def track_host_point(u, v, host_frame, penetration):
        selected_frames.append(host_frame)
        return original_host_point(u, v, host_frame, penetration)

    monkeypatch.setattr(feature_ops_module, "_host_point", track_host_point)
    feature.arguments["hostFrame"] = "positiveY"
    feature.arguments.pop("hostFace", None)

    result = apply_operation(body, feature, 5000.0)

    assert not result.IsNull()
    assert selected_frames == ["positiveY"]
