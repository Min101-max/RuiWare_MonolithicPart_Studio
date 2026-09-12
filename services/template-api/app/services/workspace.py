"""工作区上下文服务。

工作区上下文记录 GUI 当前选中的零部件，使 MCP/Agent 能够读取同一选择。
"""

from __future__ import annotations

from ..repository import Repository
from ._common import draft_or_404
from ..security import current_owner_id, current_workspace_id

STAGES = (
    "templateInfo",
    "material",
    "baseSketch",
    "features",
    "variants",
    "review",
    "admission",
)


def set_current_draft(repository: Repository, draft_id: str) -> dict:
    """校验并保存当前选中的未归档零部件。"""
    draft_or_404(repository, draft_id)
    return {"draftId": draft_id, "updatedAt": repository.set_current_draft(draft_id, current_workspace_id(), current_owner_id())}


def get_current_draft(repository: Repository) -> dict:
    """读取当前选中的零部件；不存在时明确返回未选择，不按更新时间兜底。"""
    owner_id = current_owner_id()
    workspace_id = current_workspace_id()
    scoped_workspace_id = f"{owner_id}:{workspace_id}" if owner_id and workspace_id else workspace_id
    draft_id = repository.get_current_draft_id(scoped_workspace_id)
    if not draft_id:
        return {"draftId": None, "draft": None, "updatedAt": None}
    try:
        draft = repository.get_draft(draft_id)
    except KeyError:
        repository.clear_current_draft(scoped_workspace_id)
        return {"draftId": None, "draft": None, "updatedAt": None}
    repository.ensure_draft_access(draft.id, owner_id)
    return {"draftId": draft.id, "draft": draft.model_dump(), "updatedAt": draft.updatedAt}


def engineering_status(repository: Repository, draft_id: str, *, include_details: bool = False) -> dict:
    """一次性返回指定零部件的工程状态，避免客户端重复请求多个状态接口。"""
    draft = draft_or_404(repository, draft_id)
    if include_details:
        from .context import validate_stage_with_context

        validations = {
            stage: validate_stage_with_context(repository, stage, draft)
            for stage in STAGES
        }
        validation_payload = {stage: validation.model_dump() for stage, validation in validations.items()}
        validation_mode = "detailed"
    else:
        validation_payload = {
            stage: {
                "stage": stage,
                "complete": getattr(draft.stageStatus, stage) == "complete",
                "progress": 100 if getattr(draft.stageStatus, stage) == "complete" else 0,
                "checks": [],
            }
            for stage in STAGES
        }
        validation_mode = "summary"
    return {
        "selected": True,
        "selectionSource": "gui_workspace",
        "draftId": draft.id,
        "draft": draft.model_dump(),
        "stageStatus": draft.stageStatus.model_dump(),
        "stageValidations": validation_payload,
        "latestCompile": repository.latest_compile(draft.id),
        "publishedVersions": [item.model_dump() for item in repository.list_versions(draft.id)],
        "validationMode": validation_mode,
    }


def get_current_draft_engineering_status(repository: Repository, *, include_details: bool = False) -> dict:
    """读取 GUI 当前选中的零部件并聚合其工程状态。"""
    selection = get_current_draft(repository)
    draft_id = selection.get("draftId")
    if not draft_id:
        return {
            "selected": False,
            "draftId": None,
            "draft": None,
            "message": "当前工作区尚未选中零部件，无法返回工程状态。",
            "nextAction": "请先在 GUI 零部件列表中选中一个零部件。",
        }
    return engineering_status(repository, draft_id, include_details=include_details)
