import { describe, expect, it } from "vitest";
import type { SemanticFaceDefinition, SemanticFaceLocator } from "../../../types";

const locator: SemanticFaceLocator = {
  kind: "profileEdge",
  operationId: "body.main",
  profileSketchId: "sketch.section.main",
  sourceEntityId: "edge.bottom",
};

describe("semantic face source locator contract", () => {
  it("serializes a profile-edge locator without a B-Rep index", () => {
    const face: SemanticFaceDefinition = {
      id: "part.face.front",
      label: "前侧面",
      hostFrame: "negativeY",
      sourceOperationId: "body.main",
      locator,
      uStartExpression: "-sectionWidth / 2",
      uSpanExpression: "sectionWidth",
      vStartExpression: "0",
      vSpanExpression: "length",
    };

    const roundTripped = JSON.parse(JSON.stringify(face)) as SemanticFaceDefinition;
    expect(roundTripped.locator).toEqual(locator);
    expect(roundTripped.locator).not.toHaveProperty("faceIndex");
    expect(roundTripped.locator).not.toHaveProperty("brepFaceIndex");
  });

  it("keeps legacy semantic faces valid when locator is absent", () => {
    const legacy: SemanticFaceDefinition = {
      id: "part.face.front",
      label: "前侧面",
      hostFrame: "negativeY",
      sourceOperationId: "body.main",
      uStartExpression: "-sectionWidth / 2",
      uSpanExpression: "sectionWidth",
      vStartExpression: "0",
      vSpanExpression: "length",
    };

    const roundTripped = JSON.parse(JSON.stringify(legacy)) as SemanticFaceDefinition;
    expect(roundTripped.locator).toBeUndefined();
  });

  it("uses an explicit cap side to distinguish two faces from one region", () => {
    const start: SemanticFaceLocator = {
      kind: "profileRegion",
      operationId: "body.main",
      profileSketchId: "sketch.section.main",
      sourceEntityId: "section.region.main",
      capSide: "start",
    };
    const end: SemanticFaceLocator = { ...start, capSide: "end" };

    expect(start.sourceEntityId).toBe(end.sourceEntityId);
    expect(start.capSide).toBe("start");
    expect(end.capSide).toBe("end");
  });

  it("accepts the null locator emitted when a legacy draft is re-serialized", () => {
    const legacy: SemanticFaceDefinition = {
      id: "part.face.front",
      label: "前侧面",
      hostFrame: "negativeY",
      sourceOperationId: "body.main",
      locator: null,
      uStartExpression: "-sectionWidth / 2",
      uSpanExpression: "sectionWidth",
      vStartExpression: "0",
      vSpanExpression: "length",
    };

    const roundTripped = JSON.parse(JSON.stringify(legacy)) as SemanticFaceDefinition;
    expect(roundTripped.locator).toBeNull();
  });
});
