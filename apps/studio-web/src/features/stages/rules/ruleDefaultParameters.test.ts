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
      "upright_mainHole_holeDiameter",
      "upright_mainHole_holePitch",
    ]);
    expect(second.parameterDefinitions.map((parameter) => parameter.id)).toEqual([
      "upright_mainHole_holeDiameter",
      "upright_mainHole_holePitch",
      "upright_serviceHole_holeDiameter",
      "upright_serviceHole_holePitch",
    ]);
    expect(first.rule.argumentExpressions.diameter).toBe("upright_mainHole_holeDiameter");
    expect(second.rule.placement.pitchExpression).toBe("upright_serviceHole_holePitch");
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
      "upright_serviceHole_holeDiameter",
      "upright_serviceHole_holePitch",
    ]);
  });

  it("generates slot parameters from the selected feature type", () => {
    const slotRule = { ...holeRule("upright_slot"), featureType: "straightSlot" as const };
    const result = addRuleDefaultParameters(slotRule, [] as ParameterDefinition[]);

    expect(result.parameterDefinitions.map((parameter) => parameter.id)).toEqual([
      "upright_slot_slotWidth",
      "upright_slot_slotLength",
      "upright_slot_slotPitch",
    ]);
    expect(result.rule.argumentExpressions.width).toBe("upright_slot_slotWidth");
    expect(result.rule.argumentExpressions.length).toBe("upright_slot_slotLength");
    expect(result.rule.placement.pitchExpression).toBe("upright_slot_slotPitch");
  });

  it("generates rectangular-cutout parameters from the selected feature type", () => {
    const cutoutRule = { ...holeRule("upright_cutout"), featureType: "rectangularCutout" as const };
    const result = addRuleDefaultParameters(cutoutRule, [] as ParameterDefinition[]);

    expect(result.parameterDefinitions.map((parameter) => parameter.id)).toEqual([
      "upright_cutout_cutoutWidth",
      "upright_cutout_cutoutHeight",
    ]);
    expect(result.rule.argumentExpressions.width).toBe("upright_cutout_cutoutWidth");
    expect(result.rule.argumentExpressions.height).toBe("upright_cutout_cutoutHeight");
  });
});
