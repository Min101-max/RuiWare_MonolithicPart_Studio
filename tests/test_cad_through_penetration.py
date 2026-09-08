import math

import pytest

import cad_worker.geometry as geometry_module
from cad_worker.base_entities import _through_penetration_for_shape
from OCP.BRepClass3d import BRepClass3d_SolidClassifier
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCP.TopAbs import TopAbs_OUT
from OCP.gp import gp_Pnt
from template_core.models import CanonicalPlan, StaticOperation


def _wide_short_body() -> StaticOperation:
    points = [
        (-50.0, -500.0),
        (50.0, -500.0),
        (50.0, 500.0),
        (-50.0, 500.0),
    ]
    edge_ids = ["edge.bottom", "edge.right", "edge.top", "edge.left"]
    primitives = []
    for index, edge_id in enumerate(edge_ids):
        start = points[index]
        end = points[(index + 1) % len(points)]
        primitives.append(
            {
                "id": edge_id,
                "role": f"section.{edge_id}",
                "type": "line",
                "construction": False,
                "start": {"x": start[0], "y": start[1]},
                "end": {"x": end[0], "y": end[1]},
            }
        )
    return StaticOperation(
        id="body.main",
        operator="sketch.region_extrude",
        arguments={
            # The old metadata-only calculation produces just 14 mm of tool
            # length, despite the section being 1000 mm deep in Y.
            "length": 5.0,
            "profileSketchId": "sketch.section.wide-short",
            "sketch": {
                "id": "sketch.section.wide-short",
                "profileMode": "closedRegion",
                "plane": "XY",
                "primitives": primitives,
                "regions": [
                    {
                        "id": "section.region.main",
                        "operation": "add",
                        "boundaryRefs": edge_ids,
                        "closed": True,
                        "area": 100000.0,
                    }
                ],
                "topologySignature": f"add:{','.join(edge_ids)}",
            },
        },
    )


def _top_face_hole() -> StaticOperation:
    return StaticOperation(
        id="cut.top.hole",
        operator="machining.circular_through_hole",
        arguments={
            "x": 0.0,
            "z": 2.5,
            "diameter": 2.0,
            "semanticFaceId": "part.face.top",
            "hostFrame": "positiveY",
            "hostFace": "positiveY",
            "locator": {
                "kind": "profileEdge",
                "operationId": "body.main",
                "profileSketchId": "sketch.section.wide-short",
                "sourceEntityId": "edge.top",
            },
            "resolvedSourceEntityId": "edge.top",
            "uStart": -50.0,
            "uSpan": 100.0,
            "vStart": 0.0,
            "vSpan": 5.0,
        },
    )


def _point_state(shape, point: tuple[float, float, float]):
    classifier = BRepClass3d_SolidClassifier(shape)
    classifier.Perform(gp_Pnt(*point), 1e-7)
    return classifier.State()


def test_shape_penetration_keeps_existing_minimum() -> None:
    shape = BRepPrimAPI_MakeBox(10.0, 20.0, 30.0).Shape()

    assert _through_penetration_for_shape(shape, 5000.0) == 5000.0


def test_execute_plan_locator_hole_crosses_wide_short_extrusion(
    tmp_path,
    monkeypatch,
) -> None:
    body = _wide_short_body()
    plan = CanonicalPlan(
        inputHash="wide-short-through-penetration",
        operations=[body, _top_face_hole()],
        materialSnapshot={},
        diagnostics=[],
    )
    captured = {}
    real_apply_operation = geometry_module.apply_operation

    def capture_result(shape, operation, penetration, face_map):
        captured["penetration"] = penetration
        captured["shape"] = real_apply_operation(
            shape,
            operation,
            penetration,
            face_map=face_map,
        )
        return captured["shape"]

    monkeypatch.setattr(geometry_module, "apply_operation", capture_result)
    monkeypatch.setattr(
        geometry_module,
        "write_compile_artifacts",
        lambda **_arguments: [],
    )

    result = geometry_module.execute_plan(plan, tmp_path)

    assert result.success, result.diagnostics
    assert result.metrics is not None
    assert result.metrics.valid
    assert result.metrics.solidCount == 1
    assert result.metrics.volume > 0.0
    assert captured["penetration"] > 2.0 * math.sqrt(100.0**2 + 1000.0**2 + 5.0**2)
    # The center and a point 10 mm inside the opposite wall are both removed;
    # the old 14 mm tool could only reach Y=493 from the Y=500 support face.
    assert _point_state(captured["shape"], (0.0, 0.0, 2.5)) == TopAbs_OUT
    assert _point_state(captured["shape"], (0.0, -490.0, 2.5)) == TopAbs_OUT

