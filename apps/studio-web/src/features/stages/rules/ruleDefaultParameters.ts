import type { FeatureRule, ParameterDefinition } from "../../../types";

type RuleDefaultParameter = {
  key: string;
  suffix: string;
  label: string;
  defaultValue: (rule: FeatureRule) => number;
  apply: (rule: FeatureRule, parameterId: string) => FeatureRule;
};

const parameterDefaults: Record<FeatureRule["featureType"], RuleDefaultParameter[]> = {
  circularHole: [
    {
      key: "holeDiameter",
      suffix: "holeDiameter",
      label: "孔径",
      defaultValue: (rule) =>
        typeof rule.arguments.diameter === "number" ? rule.arguments.diameter : 12,
      apply: (rule, parameterId) => {
        const argumentsNext = { ...rule.arguments };
        delete argumentsNext.diameter;
        return {
          ...rule,
          arguments: argumentsNext,
          argumentExpressions: {
            ...rule.argumentExpressions,
            diameter: parameterId,
          },
        };
      },
    },
    {
      key: "holePitch",
      suffix: "holePitch",
      label: "孔间距",
      defaultValue: (rule) => {
        const pitch = Number(rule.placement.pitchExpression);
        return Number.isFinite(pitch) ? pitch : 100;
      },
      apply: (rule, parameterId) => ({
        ...rule,
        placement: { ...rule.placement, pitchExpression: parameterId },
      }),
    },
  ],
  straightSlot: [
    {
      key: "slotWidth",
      suffix: "slotWidth",
      label: "槽宽",
      defaultValue: (rule) =>
        typeof rule.arguments.width === "number" ? rule.arguments.width : 12,
      apply: (rule, parameterId) => {
        const argumentsNext = { ...rule.arguments };
        delete argumentsNext.width;
        return {
          ...rule,
          arguments: argumentsNext,
          argumentExpressions: {
            ...rule.argumentExpressions,
            width: parameterId,
          },
        };
      },
    },
    {
      key: "slotLength",
      suffix: "slotLength",
      label: "槽长",
      defaultValue: (rule) =>
        typeof rule.arguments.length === "number" ? rule.arguments.length : 40,
      apply: (rule, parameterId) => {
        const argumentsNext = { ...rule.arguments };
        delete argumentsNext.length;
        return {
          ...rule,
          arguments: argumentsNext,
          argumentExpressions: {
            ...rule.argumentExpressions,
            length: parameterId,
          },
        };
      },
    },
    {
      key: "slotPitch",
      suffix: "slotPitch",
      label: "槽间距",
      defaultValue: (rule) => {
        const pitch = Number(rule.placement.pitchExpression);
        return Number.isFinite(pitch) ? pitch : 100;
      },
      apply: (rule, parameterId) => ({
        ...rule,
        placement: { ...rule.placement, pitchExpression: parameterId },
      }),
    },
  ],
  rectangularCutout: [
    {
      key: "cutoutWidth",
      suffix: "cutoutWidth",
      label: "切口宽度",
      defaultValue: (rule) =>
        typeof rule.arguments.width === "number" ? rule.arguments.width : 20,
      apply: (rule, parameterId) => {
        const argumentsNext = { ...rule.arguments };
        delete argumentsNext.width;
        return {
          ...rule,
          arguments: argumentsNext,
          argumentExpressions: {
            ...rule.argumentExpressions,
            width: parameterId,
          },
        };
      },
    },
    {
      key: "cutoutHeight",
      suffix: "cutoutHeight",
      label: "切口高度",
      defaultValue: (rule) =>
        typeof rule.arguments.height === "number" ? rule.arguments.height : 20,
      apply: (rule, parameterId) => {
        const argumentsNext = { ...rule.arguments };
        delete argumentsNext.height;
        return {
          ...rule,
          arguments: argumentsNext,
          argumentExpressions: {
            ...rule.argumentExpressions,
            height: parameterId,
          },
        };
      },
    },
  ],
  polygonalCutout: [],
};

export const nextAvailableParameterId = (
  parameterDefinitions: ParameterDefinition[],
  preferredId: string,
) => {
  if (!parameterDefinitions.some((parameter) => parameter.id === preferredId))
    return preferredId;
  let index = 2;
  while (parameterDefinitions.some((parameter) => parameter.id === `${preferredId}_${index}`))
    index += 1;
  return `${preferredId}_${index}`;
};

const originFor = (ruleId: string, key: string) => `ruleDefault:${ruleId}:${key}`;

const createParameter = (
  rule: FeatureRule,
  definition: RuleDefaultParameter,
  id: string,
): ParameterDefinition => {
  const defaultValue = definition.defaultValue(rule);
  return {
    id,
    label: definition.label,
    displayName: definition.label,
    valueType: "number",
    unit: "mm",
    default: defaultValue,
    minimum: 0,
    maximum: 10000,
    allowedValues: [],
    exposed: true,
    source: "user",
    sourceDefinition: {
      type: "userInput",
      dependencies: [],
      lookupTable: {},
      fallback: defaultValue,
    },
    scope: "partInstance",
    declaredInRuleStage: false,
    contractReady: true,
    ruleDefaultFor: originFor(rule.id, definition.key),
    description: `由规则“${rule.name}”自动生成的${definition.label}。`,
  };
};

export const addRuleDefaultParameters = (
  rule: FeatureRule,
  parameterDefinitions: ParameterDefinition[],
) => {
  let nextRule = rule;
  let nextParameters = [...parameterDefinitions];
  for (const definition of parameterDefaults[rule.featureType]) {
    const origin = originFor(rule.id, definition.key);
    const existing = nextParameters.find(
      (parameter) => parameter.ruleDefaultFor === origin,
    );
    const parameterId =
      existing?.id ??
      nextAvailableParameterId(nextParameters, definition.suffix);
    if (!existing)
      nextParameters = [
        ...nextParameters,
        createParameter(rule, definition, parameterId),
      ];
    nextRule = definition.apply(nextRule, parameterId);
  }
  return { rule: nextRule, parameterDefinitions: nextParameters };
};

export const removeRuleDefaultParameters = (
  parameterDefinitions: ParameterDefinition[],
  ruleId: string,
) =>
  parameterDefinitions.filter(
    (parameter) => !parameter.ruleDefaultFor?.startsWith(`ruleDefault:${ruleId}:`),
  );
