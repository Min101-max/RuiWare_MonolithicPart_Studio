"""第四阶段目标导向任务编排。

编排层只组合已有的确定性业务服务，不绕过阶段校验，也不代替用户确认写入。
"""

from __future__ import annotations

from typing import Any, Literal

from template_core.models import StageName
from template_core.stages import STAGE_ORDER

from ..errors import api_error
from ..repository import Repository
from ._common import draft_or_404
from .context import validate_stage_with_context
from .draft import complete_template_stage
from .material_assistance import apply_material_binding
from .parameters import apply_parameter_changes
from .sketch import apply_sketch_edit
from .workflow import compile_template_draft

TaskName = Literal["completeCurrentStage", "fixCurrentErrors", "prepareCadCompile", "checkPublishReadiness"]

_LABELS = {"templateInfo": "模板信息", "material": "材料", "baseSketch": "基础草图", "features": "特征规则", "variants": "参数与变体", "review": "CAD 审查", "admission": "发布准入"}


def _current_stage(draft) -> StageName | None:
    return next((stage for stage in STAGE_ORDER if getattr(draft.stageStatus, stage) != "complete"), None)


def _fix_actions(draft_id: str, stage: StageName | None, checks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    for check in checks:
        if check.get("passed"):
            continue
        if stage == "material":
            tool = "ruiware_search_materials"
        elif stage == "baseSketch":
            tool = "ruiware_preview_sketch_edit" if "sketch" in str(check.get("path", "")) else "ruiware_solve_sketch"
        elif stage in {"features", "variants"}:
            tool = "ruiware_get_parameter_help"
        elif stage in {"review", "admission"}:
            tool = "ruiware_get_latest_compile" if stage == "review" else "ruiware_get_validation_result"
        else:
            tool = "ruiware_get_draft_context"
        actions.append({"tool": tool, "draftId": draft_id, "path": check.get("path", ""), "reason": check.get("message", "请处理该校验项。")})
    return actions


def plan_task(repository: Repository, draft_id: str, task: TaskName) -> dict[str, Any]:
    draft = draft_or_404(repository, draft_id)
    current = _current_stage(draft)
    validation = validate_stage_with_context(repository, current, draft) if current else None
    if task == "completeCurrentStage":
        if current is None:
            return {"draftId": draft_id, "task": task, "baseRevision": draft.revision, "currentStage": None, "validation": None, "canExecute": False, "steps": [], "message": "全部阶段已完成。"}
        steps = ([{"tool": "ruiware_complete_stage", "draftId": draft_id, "stage": current, "requiresConfirmation": True}] if current and validation and validation.complete else _fix_actions(draft_id, current, [item.model_dump() for item in validation.checks] if validation else []))
        return {"draftId": draft_id, "task": task, "baseRevision": draft.revision, "currentStage": current, "validation": validation.model_dump() if validation else None, "canExecute": bool(current and validation and validation.complete), "steps": steps}
    if task == "fixCurrentErrors":
        checks = [item.model_dump() for item in validation.checks] if validation else []
        return {"draftId": draft_id, "task": task, "baseRevision": draft.revision, "currentStage": current, "validation": validation.model_dump() if validation else None, "canExecute": False, "steps": _fix_actions(draft_id, current, checks) if current else [], "requiresUserInput": bool(checks)}
    if task == "prepareCadCompile":
        required = STAGE_ORDER[:5]
        missing = [stage for stage in required if getattr(draft.stageStatus, stage) != "complete"]
        return {"draftId": draft_id, "task": task, "baseRevision": draft.revision, "missingStages": missing, "canExecute": not missing, "steps": ([{"tool": "ruiware_compile_draft", "draftId": draft_id, "requiresConfirmation": True}] if not missing else [{"tool": "ruiware_plan_task", "draftId": draft_id, "task": "completeCurrentStage", "reason": f"请先完成：{'、'.join(_LABELS[item] for item in missing)}"}])}
    admission = validate_stage_with_context(repository, "admission", draft)
    latest = repository.latest_compile(draft_id)
    return {"draftId": draft_id, "task": task, "baseRevision": draft.revision, "validation": admission.model_dump(), "latestCompile": latest.model_dump() if latest else None, "canExecute": admission.complete and latest is not None and latest.success, "steps": [{"tool": "ruiware_publish_template", "draftId": draft_id, "requiresConfirmation": True}] if admission.complete and latest and latest.success else _fix_actions(draft_id, "admission", [item.model_dump() for item in admission.checks])}


def execute_task(repository: Repository, draft_id: str, task: TaskName, base_revision: int, confirmed: bool = False, task_input: dict[str, Any] | None = None) -> dict[str, Any]:
    draft = draft_or_404(repository, draft_id)
    if draft.revision != base_revision:
        raise api_error("DRAFT_REVISION_CONFLICT", status_code=409, message=f"任务基于 R{base_revision}，当前已是 R{draft.revision}。", context={"baseRevision": base_revision, "currentRevision": draft.revision})
    plan = plan_task(repository, draft_id, task)
    if task == "checkPublishReadiness":
        return {"plan": plan, "executed": True}
    if not confirmed:
        raise api_error("TASK_CONFIRMATION_REQUIRED", status_code=422)
    if task == "fixCurrentErrors":
        task_input = task_input or {}
        kind = task_input.get("kind")
        if kind == "parameterChanges":
            result = apply_parameter_changes(repository, draft_id, base_revision, task_input.get("changes", []), True)
        elif kind == "sketchEdit":
            result = apply_sketch_edit(repository, draft_id, base_revision, task_input.get("changes", {}), True)
        elif kind == "materialBinding":
            result = apply_material_binding(repository, draft_id, base_revision, task_input.get("sourceRecordId", ""), task_input.get("mode", "copy"), task_input.get("role", "nominal"), True)
        else:
            raise api_error("TASK_REQUIRES_DOMAIN_INPUT", status_code=422, context={"plan": plan, "allowedKinds": ["parameterChanges", "sketchEdit", "materialBinding"]})
        return {"plan": plan, "executed": True, "result": result}
    if not plan["canExecute"]:
        raise api_error("TASK_PRECONDITION_FAILED", status_code=422, context={"plan": plan})
    if task == "completeCurrentStage":
        completed, validation = complete_template_stage(repository, plan["currentStage"], draft_id)
        return {"plan": plan, "executed": True, "draft": completed.model_dump(), "validation": validation.model_dump()}
    if task == "prepareCadCompile":
        result = compile_template_draft(repository, draft_id)
        return {"plan": plan, "executed": True, "compile": result.model_dump()}
    raise api_error("TASK_PRECONDITION_FAILED", status_code=422, context={"plan": plan})
