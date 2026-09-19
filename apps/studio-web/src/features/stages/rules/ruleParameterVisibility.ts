import type { Draft, ParameterDefinition } from "../../../types";

export type RuleParameterGroups = {
  existingParameters: ParameterDefinition[];
  predeclaredParameters: ParameterDefinition[];
  pendingParameters: ParameterDefinition[];
  canCreateParameters: boolean;
};

export function getRuleParameterGroups(
  draft: Pick<Draft, "featureRules" | "parameterDefinitions">,
): RuleParameterGroups {
  const hasRules = draft.featureRules.length > 0;
  const ruleParameters = hasRules
    ? draft.parameterDefinitions.filter(
        (parameter) => parameter.ruleDefaultFor || parameter.declaredInRuleStage,
      )
    : [];
  const predeclaredParameters = ruleParameters.filter(
    (parameter) => parameter.declaredInRuleStage && !parameter.ruleDefaultFor,
  );
  const existingParameters = ruleParameters.filter(
    (parameter) => !!parameter.ruleDefaultFor,
  );

  return {
    existingParameters,
    predeclaredParameters,
    pendingParameters: predeclaredParameters.filter(
      (parameter) => !parameter.contractReady,
    ),
    canCreateParameters: hasRules,
  };
}
