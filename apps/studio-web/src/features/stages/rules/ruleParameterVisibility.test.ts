import { describe, expect, it } from "vitest";
import type { Draft, ParameterDefinition } from "../../../types";
import { getRuleParameterGroups } from "./ruleParameterVisibility";

const parameter = (patch: Partial<ParameterDefinition>): ParameterDefinition => ({
  id: "parameter",
  label: "参数",
  unit: "mm",
  default: 0,
  exposed: true,
  source: "user",
  ...patch,
});

const draftWith = (featureRules: Draft["featureRules"], parameterDefinitions: Draft["parameterDefinitions"]): Pick<Draft, "featureRules" | "parameterDefinitions"> => ({
  featureRules,
  parameterDefinitions,
});

describe("rule parameter visibility", () => {
  it("hides all rule-page parameters when no rule exists", () => {
    const groups = getRuleParameterGroups(
      draftWith([], [
        parameter({ id: "length", label: "长度", default: 2400 }),
        parameter({ id: "sectionWidth", label: "截面宽度", default: 80 }),
      ]),
    );

    expect(groups.existingParameters).toEqual([]);
    expect(groups.predeclaredParameters).toEqual([]);
    expect(groups.pendingParameters).toEqual([]);
    expect(groups.canCreateParameters).toBe(false);
  });

  it("shows only rule-owned parameters after a rule exists", () => {
    const groups = getRuleParameterGroups(
      draftWith(
        [{ id: "rule-1" } as Draft["featureRules"][number]],
        [
          parameter({ id: "length", label: "长度", default: 2400 }),
          parameter({ id: "rule-1_holeDiameter", label: "孔径", default: 12, ruleDefaultFor: "ruleDefault:rule-1:holeDiameter" }),
          parameter({ id: "customPitch", label: "孔距", default: 100, declaredInRuleStage: true, contractReady: false }),
        ],
      ),
    );

    expect(groups.existingParameters.map((parameter) => parameter.id)).toEqual([
      "rule-1_holeDiameter",
    ]);
    expect(groups.predeclaredParameters.map((parameter) => parameter.id)).toEqual([
      "customPitch",
    ]);
    expect(groups.pendingParameters.map((parameter) => parameter.id)).toEqual([
      "customPitch",
    ]);
    expect(groups.canCreateParameters).toBe(true);
  });
});
