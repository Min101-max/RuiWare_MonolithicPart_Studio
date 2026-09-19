import {
  ArrowLeft,
  ArrowRight,
  Ban,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Download,
  ListChecks,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { CadViewer } from "../../../../components/review/CadViewer";
import { PanelTitle } from "../../../../components/ui/FormParts";
import type { CompileResult, Draft, StageName } from "../../../../types";
import { STAGE_PREFLIGHT_ORDER } from "../../../draft/stagePreflight";
import type { PreflightResult } from "../../../draft/stagePreflight";
import { STAGES } from "../../../workflow/stageConfig";
import { sweepPreviewAdmission } from "./sweepPreviewAdmission";

type ReviewStageProps = {
  result: CompileResult | null;
  run: () => void;
  busy: string;
  complete: () => void;
  draft: Draft;
  compileStatus: "idle" | "generating" | "succeeded" | "failed";
  compileStale: boolean;
  preflight: PreflightResult | null;
  preflightStale: boolean;
  checkPrerequisites: (force?: boolean) => void;
  openStage: (stage: StageName) => void;
};

const preflightStatusLabels = {
  pending: "待检查",
  passed: "通过",
  failed: "未通过",
  blocked: "等待前序阶段",
} as const;

export function ReviewStage({
  result,
  run,
  busy,
  complete,
  draft,
  compileStatus,
  compileStale,
  preflight,
  preflightStale,
  checkPrerequisites,
  openStage,
}: ReviewStageProps) {
  const admission = sweepPreviewAdmission(draft);
  const preflightReady = preflight?.status === "passed" && !preflightStale && preflight.checkedRevision === draft.revision;
  const preflightStages: PreflightResult["stages"] = preflight?.stages.length
    ? preflight.stages
    : STAGE_PREFLIGHT_ORDER.map((stage) => ({ stage, status: "pending" as const }));
  const preflightSummary = preflightStale
    ? "内容已修改，检查结果已过期"
    : preflight?.status === "checking"
      ? "正在逐阶段检查"
      : preflight?.status === "passed"
        ? "所有前置阶段已通过"
        : preflight?.status === "failed"
          ? "发现问题，修复后重新检查"
          : "检查定义、材料、几何、规则和契约";
  const preflightBlockReason = !preflightReady
    ? preflight?.status === "checking"
      ? "正在检查前置阶段"
      : preflightStale
        ? "前置检查已过期，请重新检查"
        : preflight?.status === "failed"
          ? "前置阶段检查未通过"
          : "请先检查前置阶段"
    : "";
  const compileBlockReason = preflightBlockReason || (admission.allowed ? "" : `缺少：${admission.missing.join("、")}`);
  const sweep = draft.geometryRecipe.operations.find((item) => item.operator === "solid.sweep");
  const orientationLabels = { followPath: "跟随路径", fixedWorld: "固定世界方向", minimumTwist: "最小扭转" } as const;
  return (
    <>
      <section
        className={`preflight-panel ${preflight?.status ?? "idle"}${preflightStale ? " stale" : ""}`}
        aria-busy={preflight?.status === "checking"}
        aria-labelledby="preflight-title"
      >
        <div className="preflight-heading">
          <div>
            <span className="preflight-title"><ListChecks size={16} /><strong id="preflight-title">前置阶段检查</strong></span>
            <small role="status">{preflightSummary}</small>
          </div>
          <button
            type="button"
            className="secondary-btn"
            disabled={!!busy || preflight?.status === "checking"}
            onClick={() => checkPrerequisites(!!preflight)}
          >
            {preflight?.status === "checking" ? <LoaderCircle className="spin" /> : <ListChecks />}
            {preflight?.status === "checking" ? "检查中" : preflight ? "重新检查" : "一键检查"}
          </button>
        </div>
        <ol className="preflight-stages">
          {preflightStages.map((stageResult) => {
            const config = STAGES.find(({ id }) => id === stageResult.stage);
            const issues = stageResult.validation?.checks.filter((check) => !check.passed) ?? [];
            const problematic = stageResult.status === "failed" || stageResult.status === "blocked" || issues.length > 0;
            return (
              <li className={`preflight-stage-row ${stageResult.status}`} key={stageResult.stage}>
                <div className="preflight-stage-summary">
                  {stageResult.status === "passed" ? <CheckCircle2 /> : stageResult.status === "failed" ? <CircleAlert /> : stageResult.status === "blocked" ? <Ban /> : <CircleDashed />}
                  <div>
                    <strong>{config ? `${config.number} ${config.title}` : stageResult.stage}</strong>
                    <span>{preflightStatusLabels[stageResult.status]}</span>
                  </div>
                </div>
                {issues.length > 0 && (
                  <ul className="preflight-issues">
                    {issues.map((check) => (
                      <li className={check.severity} key={check.id}>
                        <CircleAlert />
                        <span><strong>{check.severity === "warning" ? "警告" : "错误"} · {check.label}</strong>{check.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {problematic && preflight?.status !== "checking" && (
                  <button
                    type="button"
                    className="text-btn preflight-open-stage"
                    aria-label={`返回${config?.title ?? "该"}阶段修改`}
                    onClick={() => openStage(stageResult.stage)}
                  >
                    <ArrowLeft />
                    去修改
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </section>
      <div className="review-toolbar">
        <div>
          <strong>确定性几何编译</strong>
          <span>规则先展开为静态几何计划，再由 OpenCascade 生成 STEP 主模型和 STL 预览。</span>
        </div>
        <button
          type="button"
          className="primary-btn"
          disabled={!!busy || !admission.allowed || !preflightReady}
          aria-describedby={preflightBlockReason ? "compile-gate-message" : !admission.allowed ? "admission-gate-message" : undefined}
          onClick={run}
          title={compileBlockReason}
        >
          {busy === "compile" ? <LoaderCircle className="spin" /> : <RefreshCw />}
          {busy === "compile" ? "编译中" : "运行 B-Rep 编译"}
        </button>
        {preflightBlockReason && <small id="compile-gate-message" className="preview-admission-warning">{preflightBlockReason}</small>}
        {!admission.allowed && <small id="admission-gate-message" className="preview-admission-warning">三维预览暂不可用，缺少：{admission.missing.join("、")}</small>}
      </div>
      {sweep && <div className="sweep-review-summary">
        <span>扫掠路径：{draft.sweepPath?.status === "confirmed" ? "已确认" : "未确认"}</span>
        <span>拓扑：{admission.missing.includes("有效路径拓扑") ? "无效" : "有效"}</span>
        <span>锚点：{sweep.profileAnchor ?? "sketch.origin"}</span>
        <span>姿态：{orientationLabels[sweep.orientationMode ?? "minimumTwist"]}</span>
        <span>缩放：{sweep.scaleMode ?? "constant"}</span>
        <span>扭转：{sweep.twistMode ?? "none"}</span>
        <span>拐角：{sweep.cornerMode ?? "right"}</span>
        <strong className={`compile-status ${compileStatus}`}>生成状态：{compileStatus === "generating" ? "生成中" : compileStatus === "succeeded" ? "生成成功" : compileStatus === "failed" ? "生成失败" : "未生成"}</strong>
        {compileStale && <strong className="compile-stale">旧结果已过期</strong>}
      </div>}
      <CadViewer result={result} stale={compileStale} />
      {result && (
        <div className="metrics-grid">
          <div>
            <span>编译状态</span>
            <strong className={result.success ? "ok" : "bad"}>
              {result.success ? "通过" : "失败"}
            </strong>
          </div>
          <div>
            <span>B-Rep</span>
            <strong>{result.metrics?.valid ? "有效" : "—"}</strong>
          </div>
          <div>
            <span>实体数量</span>
            <strong>{result.metrics?.solidCount ?? "—"}</strong>
          </div>
          <div>
            <span>体积</span>
            <strong>
              {result.metrics ? `${result.metrics.volume.toLocaleString()} mm³` : "—"}
            </strong>
          </div>
          <div>
            <span>几何算子</span>
            <strong>{result.metrics?.operationCount ?? "—"}</strong>
          </div>
        </div>
      )}
      {result?.diagnostics.map((diagnostic, index) => (
        <div className={`diagnostic ${diagnostic.severity}`} key={index}>
          <CircleAlert size={14} />
          <span>
            <strong>{diagnostic.code}</strong>
            {diagnostic.message}
          </span>
        </div>
      ))}
      {result?.artifacts.length ? (
        <div className="panel">
          <PanelTitle
            icon={Download}
            title="验证产物"
            subtitle="STEP 为权威模型；计划、诊断和语义映射用于复现与审计。"
          />
          <div className="artifact-list">
            {result.artifacts.map((artifact) => (
              <a href={artifact.url} key={artifact.kind} download>
                <span>{artifact.kind.toUpperCase()}</span>
                <div>
                  <strong>{artifact.url.split("/").pop()}</strong>
                  <small>SHA-256 {artifact.sha256.slice(0, 16)}…</small>
                </div>
                <Download size={15} />
              </a>
            ))}
          </div>
          <button className="primary-btn full-btn" disabled={!result.success || !!busy} onClick={complete}>
            确认几何审查
            <ArrowRight size={15} />
          </button>
        </div>
      ) : null}
    </>
  );
}




