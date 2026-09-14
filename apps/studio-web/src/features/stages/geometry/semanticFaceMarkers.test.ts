import { describe, expect, it } from "vitest";
import {
  filterSemanticFaceMarkers,
  regionsForSelectedEntities,
  semanticFaceMarkers,
} from "./semanticFaceMarkers";
import type { Draft } from "../../../types";

const draft = (
  face: Partial<Draft["geometryRecipe"]["semanticFaces"][number]>,
  plane: Draft["sketch"]["plane"] = "XY",
): Draft => ({
  sketch: {
    plane,
    entities: [
      { id: "edge.horizontal", role: "edge", geometryType: "line", construction: false, start: [-50, 30], end: [-30, 30], points: [] },
      { id: "edge.vertical", role: "edge", geometryType: "line", construction: false, start: [-30, -10], end: [-30, 30], points: [] },
    ],
    regions: [{ id: "region.main", boundaryRefs: ["edge.horizontal", "edge.vertical"], closed: true, role: "section", operation: "add" }],
  } as unknown as Draft["sketch"],
  geometryRecipe: {
    sketches: ["sketch.main"],
    operations: [{ id: "body.main", operator: "sketch.region_extrude", sourceRefs: ["sketch.main"], profileSketchId: "sketch.main" }],
    semanticFaces: [{ id: "face.test", label: "测试面", hostFrame: "positiveY", sourceOperationId: "body.main", uStartExpression: "0", uSpanExpression: "1", vStartExpression: "0", vSpanExpression: "1", ...face }],
  } as Draft["geometryRecipe"],
} as Draft);

const regionDraft = (capSide: "start" | "end", operation: "add" | "subtract" = "add"): Draft => ({
  sketch: {
    plane: "XY",
    entities: [
      { id: "edge.bottom", role: "edge", geometryType: "line", construction: false, start: [-50, -20], end: [50, -20], points: [] },
      { id: "edge.right", role: "edge", geometryType: "line", construction: false, start: [50, -20], end: [50, 30], points: [] },
      { id: "edge.top", role: "edge", geometryType: "line", construction: false, start: [50, 30], end: [-50, 30], points: [] },
      { id: "edge.left", role: "edge", geometryType: "line", construction: false, start: [-50, 30], end: [-50, -20], points: [] },
    ],
    regions: [{ id: "region.main", boundaryRefs: ["edge.bottom", "edge.right", "edge.top", "edge.left"], closed: true, role: "section", operation }],
  } as unknown as Draft["sketch"],
  geometryRecipe: {
    sketches: ["sketch.main"],
    operations: [{ id: "body.main", operator: "sketch.region_extrude", sourceRefs: ["sketch.main"], profileSketchId: "sketch.main" }],
    semanticFaces: [{ id: "face.cap", label: "端面", hostFrame: "positiveY", sourceOperationId: "body.main", uStartExpression: "0", uSpanExpression: "1", vStartExpression: "0", vSpanExpression: "1", locator: { kind: "profileRegion", operationId: "body.main", profileSketchId: "sketch.main", sourceEntityId: "region.main", capSide } }],
  } as Draft["geometryRecipe"],
} as Draft);

describe("semanticFaceMarkers", () => {
  it("uses the minimum corner of a profile edge", () => {
    const marker = semanticFaceMarkers(draft({ locator: { kind: "profileEdge", operationId: "body.main", profileSketchId: "sketch.main", sourceEntityId: "edge.horizontal" } }))[0];
    expect(marker.origin).toEqual({ x: -50, y: 30 });
    expect(marker.sourceSegment).toEqual({
      start: { x: -50, y: 30 },
      end: { x: -30, y: 30 },
    });
    expect(marker.label).toBe("face.test");
    expect(marker.locatorKind).toBe("profileEdge");
    expect(marker.sourceEntityId).toBe("edge.horizontal");
    expect(marker.sourceRegionId).toBeUndefined();
  });

  it("keeps the projected origin on the minimum endpoint when edge order is reversed", () => {
    const value = draft({ locator: { kind: "profileEdge", operationId: "body.main", profileSketchId: "sketch.main", sourceEntityId: "edge.horizontal" } });
    [value.sketch.entities[0].start, value.sketch.entities[0].end] = [
      value.sketch.entities[0].end,
      value.sketch.entities[0].start,
    ];
    expect(semanticFaceMarkers(value)[0].origin).toEqual({ x: -50, y: 30 });
  });

  it("maps a vertical face to U=Y and V=X", () => {
    const marker = semanticFaceMarkers(draft({ hostFrame: "positiveX", locator: { kind: "profileEdge", operationId: "body.main", profileSketchId: "sketch.main", sourceEntityId: "edge.vertical" } }))[0];
    expect(marker.origin).toEqual({ x: -30, y: -10 });
    expect(marker.u).toEqual({ x: 0, y: 1 });
    expect(marker.v).toBeNull();
    expect(marker.outOfPlane).toBe("v");
  });

  it("skips unresolved locators", () => {
    expect(semanticFaceMarkers(draft({ locator: { kind: "profileEdge", operationId: "body.main", profileSketchId: "sketch.main", sourceEntityId: "missing" } }))).toEqual([]);
  });

  it("uses the region bounding-box minimum corner for either cap", () => {
    const startDraft = regionDraft("start");
    const endDraft = regionDraft("end");
    startDraft.geometryRecipe.semanticFaces[0].hostFrame = "negativeZ";
    endDraft.geometryRecipe.semanticFaces[0].hostFrame = "positiveZ";
    const start = semanticFaceMarkers(startDraft)[0];
    const end = semanticFaceMarkers(endDraft)[0];
    expect(start.origin).toEqual({ x: -50, y: -20 });
    expect(end.origin).toEqual(start.origin);
    expect(start.locatorKind).toBe("profileRegion");
    expect(start.sourceRegionId).toBe("region.main");
    expect(start.sourceEntityId).toBe("region.main");
  });

  it("does not resolve a subtractive region as a semantic cap", () => {
    const value = regionDraft("start", "subtract");
    value.geometryRecipe.semanticFaces[0].hostFrame = "negativeZ";
    expect(semanticFaceMarkers(value)).toEqual([]);
  });

  it("projects host-frame axes onto an XZ sketch", () => {
    const marker = semanticFaceMarkers(draft({ hostFrame: "positiveX", locator: { kind: "profileEdge", operationId: "body.main", profileSketchId: "sketch.main", sourceEntityId: "edge.vertical" } }, "XZ"))[0];
    expect(marker.u).toBeNull();
    expect(marker.v).toEqual({ x: 0, y: 1 });
    expect(marker.outOfPlane).toBe("u");
  });

  it("does not resolve a construction source edge", () => {
    const value = draft({ locator: { kind: "profileEdge", operationId: "body.main", profileSketchId: "sketch.main", sourceEntityId: "edge.horizontal" } });
    value.sketch.entities[0].construction = true;
    expect(semanticFaceMarkers(value)).toEqual([]);
  });

  it("keeps a side-face edge from a subtractive region resolvable", () => {
    const value = draft({ locator: { kind: "profileEdge", operationId: "body.main", profileSketchId: "sketch.main", sourceEntityId: "edge.horizontal" } });
    value.sketch.regions[0].operation = "subtract";
    expect(semanticFaceMarkers(value)).toHaveLength(1);
  });

  it("does not invent an origin for an incompatible host frame", () => {
    expect(semanticFaceMarkers(draft({ hostFrame: "positiveX", locator: { kind: "profileEdge", operationId: "body.main", profileSketchId: "sketch.main", sourceEntityId: "edge.horizontal" } }))).toEqual([]);
  });

  it("filters markers by explicit edge or region selection", () => {
    const value = regionDraft("start");
    value.geometryRecipe.semanticFaces[0].hostFrame = "positiveZ";
    value.geometryRecipe.semanticFaces.push({
      id: "face.edge",
      label: "边面",
      hostFrame: "positiveX",
      sourceOperationId: "body.main",
      uStartExpression: "0",
      uSpanExpression: "1",
      vStartExpression: "0",
      vSpanExpression: "1",
      locator: {
        kind: "profileEdge",
        operationId: "body.main",
        profileSketchId: "sketch.main",
        sourceEntityId: "edge.right",
      },
    });
    const markers = semanticFaceMarkers(value);
    expect(filterSemanticFaceMarkers(markers, null)).toEqual([]);
    expect(filterSemanticFaceMarkers(markers, { kind: "edge", sourceEntityIds: ["edge.right"] }).map((item) => item.id)).toEqual(["face.edge"]);
    expect(filterSemanticFaceMarkers(markers, { kind: "region", sourceRegionIds: ["region.main"] }).map((item) => item.id)).toEqual(["face.cap"]);
  });

  it("supports multiple source ids without mutating the marker list", () => {
    const value = regionDraft("start");
    value.geometryRecipe.semanticFaces.push({
      id: "face.edge",
      label: "边面",
      hostFrame: "positiveX",
      sourceOperationId: "body.main",
      uStartExpression: "0",
      uSpanExpression: "1",
      vStartExpression: "0",
      vSpanExpression: "1",
      locator: {
        kind: "profileEdge",
        operationId: "body.main",
        profileSketchId: "sketch.main",
        sourceEntityId: "edge.right",
      },
    });
    const markers = semanticFaceMarkers(value);
    const selected = filterSemanticFaceMarkers(markers, {
      kind: "edge",
      sourceEntityIds: ["edge.right", "missing"],
    });
    expect(selected.map((item) => item.id)).toEqual(["face.edge"]);
    expect(markers).toHaveLength(1);
  });

  it("only treats fully covered additive closed regions as a region selection", () => {
    const value = regionDraft("start");
    expect(regionsForSelectedEntities(value, ["edge.bottom", "edge.right"])).toEqual([]);
    expect(regionsForSelectedEntities(value, value.sketch.regions[0].boundaryRefs)).toEqual(["region.main"]);
    value.sketch.regions.push({ ...value.sketch.regions[0], id: "region.cut", operation: "subtract" });
    expect(regionsForSelectedEntities(value, value.sketch.regions[0].boundaryRefs)).toEqual(["region.main"]);
  });
});
