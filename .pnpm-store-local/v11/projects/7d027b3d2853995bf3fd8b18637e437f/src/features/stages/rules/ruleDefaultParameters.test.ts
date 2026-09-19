import { describe, expect, it } from "vitest";
import type { FeatureRule, ParameterDefinition } from "../../../types";
import {
  addRuleDefaultParameters,
  removeRuleDefaultParameters,
} from "./ruleDefaultParameters";

const holeRule = (id: string): FeatureRule => ({
  id,
  name: id,
  featureType: "circularHole",
  enabled: true,
  conditionExpression: "True",
  countExpression: "1",
  indexVariable: "i",
  arguments: { x: 0, diameter: 12 },
  argumentExpressions: { z: "length / 2" },
  faceBindings: [],
  profileDimensions: [],
  placement: {
    mode: "single",
    axis: "v",
    pitchExpression: "100",
    startMarginExpression: "0",
    endMarginExpression: "0",
    maximumPitchExpression: "300",
  },
  polygonVertices: [],
  maximumCount: 200,
  description: "",
});

describe("rule default parameters", () => {
  it("gives each circular-hole rule its own diameter and pitch parameters", () => {
    const first = addRuleDefaultParameters(holeRule("upright_mainHole"), []);
    const second = addRuleDefaultParameters(
      holeRule("upright_serviceHole"),
      first.parameterDefinitions,
    );

    expect(first.parameterDefinitions.map((parameter) => parameter.id)).toEqual([
      "holeDiameter",
      "holePitch",
    ]);
    expect(second.parameterDefinitions.map((parameter) => parameter.id)).toEqual([
      "holeDiameter",
      "holePitch",
      "holeDiameter_2",
      "holePitch_2",
    ]);
    expect(first.rule.argumentExpressions.diameter).toBe("holeDiameter");
    expect(second.rule.placement.pitchExpression).toBe("holePitch_2");
    expect(first.parameterDefinitions[0].ruleDefaultFor).toBe(
      "ruleDefault:upright_mainHole:holeDiameter",
    );
  });

  it("removes only the defaults belonging to the deleted rule", () => {
    const first = addRuleDefaultParameters(holeRule("upright_mainHole"), []);
    const second = addRuleDefaultParameters(
      holeRule("upright_serviceHole"),
      first.parameterDefinitions,
    );

    const remaining = removeRuleDefaultParameters(
      second.parameterDefinitions,
      "upright_mainHole",
    );

    expect(remaining.map((parameter) => parameter.id)).toEqual([
      "holeDiameter_2",
      "holePitch_2",
    ]);
  });

  it("generates slot parameters from the selected feature type", () => {
    const slotRule = { ...holeRule("upright_slot"), featureType: "straightSlot" as const };
    const result = addRuleDefaultParameters(slotRule, [] as ParameterDefinition[]);

    expect(result.parameterDefinitions.map((parameter) => parameter.id)).toEqual([
      "slotWidth",
      "slotLength",
      "slotPitch",
    ]);
    expect(result.rule.argumentExpressions.width).toBe("slotWidth");
    expect(result.rule.argumentExpressions.length).toBe("slotLength");
    expect(result.rule.placement.pitchExpression).toBe("slotPitch");
  });

  it("generates rectangular-cutout parameters from the selected feature type", () => {
    const cutoutRule = { ...holeRule("upright_cutout"), featureType: "rectangularCutout" as const };
    const result = addRuleDefaultParameters(cutoutRule, [] as ParameterDefinition[]);

    expect(result.parameterDefinitions.map((parameter) => parameter.id)).toEqual([
      "cutoutWidth",
      "cutoutHeight",
    ]);
    expect(result.rule.argumentExpressions.width).toBe("cutoutWidth");
    expect(result.rule.argumentExpressions.height).toBe("cutoutHeight");
  });

  it("adds a numeric suffix when a simplified ID is already used", () => {
    const result = addRuleDefaultParameters(
      holeRule("another-hole"),
      [{ id: "holeDiameter" } as ParameterDefinition],
    );

    expect(result.parameterDefinitions.map((parameter) => parameter.id)).toEqual([
      "holeDiameter",
      "holeDiameter_2",
      "holePitch",
    ]);
    expect(result.rule.argumentExpressions.diameter).toBe("holeDiameter_2");
  });
});
