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
  straightSlot: [],
  rectangularCutout: [],
  polygonalCutout: [],
};

const parameterIdFor = (ruleId: string, suffix: string) => {
  const normalized = ruleId.replace(/[^A-Za-z0-9_]/g, "_");
  return `${/^[A-Za-z]/.test(normalized) ? normalized : `feature_${normalized}`}_${suffix}`;
};

const nextAvailableId = (
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
      nextAvailableId(nextParameters, parameterIdFor(rule.id, definition.suffix));
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
