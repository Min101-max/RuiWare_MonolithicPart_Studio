import { describe, expect, it, vi } from "vitest";
import type { Draft, StageValidation } from "../../types";
import {
  hydratePreflightFromDraft,
  runStagePreflight,
  STAGE_PREFLIGHT_ORDER,
  type StagePreflightClient,
  type StagePreflightStage,
} from "./stagePreflight";

const draft = (revision: number, complete: StagePreflightStage[] = []): Draft => ({
  id: "draft-1",
  revision,
  stageStatus: Object.fromEntries([
    ...STAGE_PREFLIGHT_ORDER.map((stage) => [stage, complete.includes(stage) ? "complete" : "not_started"]),
    ["review", "not_started"],
    ["admission", "not_started"],
  ]),
} as unknown as Draft);

const validation = (stage: StagePreflightStage, intrinsicError = false, blocked = false): StageValidation => ({
  stage,
  complete: !intrinsicError && !blocked,
  progress: intrinsicError || blocked ? 0 : 100,
  checks: [
    ...(blocked ? [{ id: "workflow-prerequisites", label: "prerequisites", passed: false, severity: "error" as const, path: "stageStatus", message: "blocked" }] : []),
    ...(intrinsicError ? [{ id: `${stage}-required`, label: "required", passed: false, severity: "error" as const, path: stage, message: "invalid" }] : []),
  ],
});

describe("stage preflight", () => {
  it("hydrates a passed result from a fully completed draft without fabricating checks", () => {
    const restored = hydratePreflightFromDraft(draft(12, [...STAGE_PREFLIGHT_ORDER]));

    expect(restored).toMatchObject({ checkedRevision: 12, status: "passed", failedStages: [] });
    expect(restored?.stages).toEqual(STAGE_PREFLIGHT_ORDER.map((stage) => ({ stage, status: "passed" })));
    expect(hydratePreflightFromDraft(draft(12, ["templateInfo"]))).toBeNull();
  });

  it("skips completed stages by default and rechecks them only when forced", async () => {
    const complete = draft(12, [...STAGE_PREFLIGHT_ORDER]);
    const client: StagePreflightClient = {
      validateStage: vi.fn(async (_id, stage) => validation(stage as StagePreflightStage)),
      completeStage: vi.fn(),
    };

    const cached = await runStagePreflight(complete, undefined, client);
    expect(cached.result.status).toBe("passed");
    expect(client.validateStage).not.toHaveBeenCalled();
    expect(client.completeStage).not.toHaveBeenCalled();

    const refreshed = await runStagePreflight(complete, undefined, client, undefined, { force: true });
    expect(refreshed.result.status).toBe("passed");
    expect(client.validateStage).toHaveBeenCalledTimes(STAGE_PREFLIGHT_ORDER.length);
  });

  it("validates the whole invalid batch in parallel and never completes a stage", async () => {
    const pending = new Map<StagePreflightStage, (value: StageValidation) => void>();
    const client: StagePreflightClient = {
      validateStage: vi.fn((_id, stage) => new Promise<StageValidation>((resolve) => pending.set(stage as StagePreflightStage, resolve))),
      completeStage: vi.fn(),
    };

    const preflight = runStagePreflight(draft(8), undefined, client);
    await Promise.resolve();
    expect(client.validateStage).toHaveBeenCalledTimes(5);
    STAGE_PREFLIGHT_ORDER.forEach((stage) => pending.get(stage)!(validation(stage, true, stage !== "templateInfo")));

    const { result } = await preflight;
    expect(result.status).toBe("failed");
    expect(result.failedStages).toEqual(STAGE_PREFLIGHT_ORDER);
    expect(result.stages.every((item) => item.status === "failed")).toBe(true);
    expect(client.completeStage).not.toHaveBeenCalled();
  });

  it("ignores prerequisite-only blocks and completes stages with each latest revision", async () => {
    const start = draft(10, ["templateInfo"]);
    const completedStages = new Set<StagePreflightStage>(["templateInfo"]);
    const client: StagePreflightClient = {
      validateStage: vi.fn(async (_id, stage) => validation(stage as StagePreflightStage, false, stage !== "templateInfo")),
      completeStage: vi.fn(async (_id, stage, revision) => {
        completedStages.add(stage as StagePreflightStage);
        const next = draft(revision + 1, [...completedStages]);
        return { draft: next, validation: validation(stage as StagePreflightStage) };
      }),
    };

    const { draft: completed, result } = await runStagePreflight(start, undefined, client);

    expect(client.completeStage).toHaveBeenCalledTimes(4);
    expect(vi.mocked(client.completeStage).mock.calls.map(([, stage, revision]) => [stage, revision])).toEqual([
      ["material", 10],
      ["baseSketch", 11],
      ["features", 12],
      ["variants", 13],
    ]);
    expect(completed.revision).toBe(14);
    expect(result).toMatchObject({ checkedRevision: 14, status: "passed", failedStages: [] });
    expect(result.stages.every((item) => item.status === "passed")).toBe(true);
  });

  it("stops completing stages when the run is cancelled", async () => {
    const controller = new AbortController();
    const client: StagePreflightClient = {
      validateStage: vi.fn(async (_id, stage) => validation(stage as StagePreflightStage, false, stage !== "templateInfo")),
      completeStage: vi.fn(async (_id, stage, revision) => {
        controller.abort();
        return { draft: draft(revision + 1, [stage as StagePreflightStage]), validation: validation(stage as StagePreflightStage) };
      }),
    };

    await expect(runStagePreflight(draft(1), undefined, client, controller.signal)).rejects.toThrow();
    expect(client.completeStage).toHaveBeenCalledTimes(1);
  });

  it("rechecks completed stages that were initially blocked by inconsistent status", async () => {
    const completedStages = new Set<StagePreflightStage>(STAGE_PREFLIGHT_ORDER.slice(1));
    let current = draft(4, [...completedStages]);
    const client: StagePreflightClient = {
      validateStage: vi.fn(async (_id, stage) => {
        const index = STAGE_PREFLIGHT_ORDER.indexOf(stage as StagePreflightStage);
        const blocked = STAGE_PREFLIGHT_ORDER.slice(0, index).some((item) => current.stageStatus[item] !== "complete");
        return validation(stage as StagePreflightStage, false, blocked);
      }),
      completeStage: vi.fn(async (_id, stage, revision) => {
        completedStages.add(stage as StagePreflightStage);
        current = draft(revision + 1, [...completedStages]);
        return { draft: current, validation: validation(stage as StagePreflightStage) };
      }),
    };

    const { result } = await runStagePreflight(current, undefined, client);

    expect(client.completeStage).toHaveBeenCalledTimes(1);
    expect(client.validateStage).toHaveBeenCalledTimes(9);
    expect(result.status).toBe("passed");
    expect(result.stages.every((item) => item.status === "passed")).toBe(true);
  });
});
