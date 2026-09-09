"""工作区上下文服务。

工作区上下文记录 GUI 当前选中的零部件，使 MCP/Agent 能够读取同一选择。
"""

from __future__ import annotations

from ..repository import Repository
from ._common import draft_or_404
from ..security import current_owner_id, current_workspace_id


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
