import { api } from "../../api";
import type { Draft, StageActionResult, StageName, StageValidation } from "../../types";

export const STAGE_PREFLIGHT_ORDER = [
  "templateInfo",
  "material",
  "baseSketch",
  "features",
  "variants",
] as const satisfies readonly StageName[];

export type StagePreflightStage = (typeof STAGE_PREFLIGHT_ORDER)[number];
export type StagePreflightStageResult = {
  stage: StagePreflightStage;
  status: "pending" | "passed" | "failed" | "blocked";
  validation?: StageValidation;
};
export type StagePreflightResult = {
  checkedRevision: number;
  status: "checking" | "passed" | "failed";
  stages: StagePreflightStageResult[];
  failedStages: StagePreflightStage[];
};
export type PreflightResult = StagePreflightResult;
export type StagePreflightClient = {
  validateStage: (id: string, stage: StageName, signal?: AbortSignal) => Promise<StageValidation>;
  completeStage: (id: string, stage: StageName, baseRevision: number, signal?: AbortSignal) => Promise<StageActionResult>;
};

export type StagePreflightOptions = {
  force?: boolean;
};

const stageStatus = (validation: StageValidation): StagePreflightStageResult["status"] => {
  if (validation.checks.some((check) => !check.passed && check.severity === "error" && check.id !== "workflow-prerequisites")) return "failed";
  return validation.checks.some((check) => !check.passed && check.id === "workflow-prerequisites") ? "blocked" : "passed";
};

export function hydratePreflightFromDraft(draft: Draft): StagePreflightResult | null {
  if (!STAGE_PREFLIGHT_ORDER.every((stage) => draft.stageStatus[stage] === "complete")) return null;
  return {
    checkedRevision: draft.revision,
    status: "passed",
    stages: STAGE_PREFLIGHT_ORDER.map((stage) => ({ stage, status: "passed" as const })),
    failedStages: [],
  };
}

export async function runStagePreflight(
  draft: Draft,
  onProgress?: (result: StagePreflightResult) => void,
  client: StagePreflightClient = api,
  signal?: AbortSignal,
  options: StagePreflightOptions = {},
): Promise<{ draft: Draft; result: StagePreflightResult }> {
  const id = draft.id;
  if (!id) throw new Error("Stage preflight requires a saved draft.");
  const checkedRevision = draft.revision;
  onProgress?.({ checkedRevision, status: "checking", stages: [], failedStages: [] });

  const stagesToValidate = STAGE_PREFLIGHT_ORDER.filter((stage, index) => {
    if (options.force) return true;
    if (draft.stageStatus[stage] !== "complete") return true;
    return !STAGE_PREFLIGHT_ORDER.slice(0, index).every((previous) => draft.stageStatus[previous] === "complete");
  });
  let stages: StagePreflightStageResult[] = STAGE_PREFLIGHT_ORDER.map((stage) => ({
    stage,
    status: draft.stageStatus[stage] === "complete" ? "passed" as const : "pending" as const,
  }));
  const validations = await Promise.all(
    stagesToValidate.map(async (stage) => [stage, await client.validateStage(id, stage, signal)] as const),
  );
  stages = stages.map((item) => {
    const validation = validations.find(([stage]) => stage === item.stage)?.[1];
    return validation ? { stage: item.stage, status: stageStatus(validation), validation } : item;
  });
  signal?.throwIfAborted();
  let failedStages = stages.filter((item) => item.status === "failed").map((item) => item.stage);

  if (failedStages.length) {
    const result: StagePreflightResult = { checkedRevision, status: "failed", stages, failedStages };
    onProgress?.(result);
    return { draft, result };
  }

  let current = draft;
  onProgress?.({ checkedRevision, status: "checking", stages, failedStages });
  for (const stage of STAGE_PREFLIGHT_ORDER) {
    signal?.throwIfAborted();
    if (current.stageStatus[stage] === "complete") {
      if (stages.find((item) => item.stage === stage)?.status !== "blocked") continue;
      const validation = await client.validateStage(id, stage, signal);
      signal?.throwIfAborted();
      const status = stageStatus(validation);
      stages = stages.map((item) => item.stage === stage ? { stage, status, validation } : item);
      if (status === "passed") continue;
      failedStages = [stage];
      const result: StagePreflightResult = { checkedRevision: current.revision, status: "failed", stages, failedStages };
      onProgress?.(result);
      return { draft: current, result };
    }
    const completion = await client.completeStage(id, stage, current.revision, signal);
    signal?.throwIfAborted();
    current = completion.draft;
    stages = stages.map((item) => item.stage === stage
      ? { stage, status: completion.validation.complete ? "passed" : "failed", validation: completion.validation }
      : item);
    if (!completion.validation.complete) {
      failedStages = [stage];
      const result: StagePreflightResult = { checkedRevision: current.revision, status: "failed", stages, failedStages };
      onProgress?.(result);
      return { draft: current, result };
    }
    onProgress?.({ checkedRevision: current.revision, status: "checking", stages, failedStages });
  }

  const result: StagePreflightResult = { checkedRevision: current.revision, status: "passed", stages, failedStages };
  onProgress?.(result);
  return { draft: current, result };
}
