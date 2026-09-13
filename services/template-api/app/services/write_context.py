"""Shared write metadata used by GUI and Agent operations."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from fastapi import Request

from ..errors import api_error


@dataclass(frozen=True)
class WriteContext:
    actor: Literal["gui", "agent"] = "gui"
    source: str = "gui"
    session_id: str | None = None
    base_revision: int | None = None
    confirmed: bool = False


def _bool(value: Any, *, field: str) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str) and value.lower() in {"true", "1", "yes"}:
        return True
    if isinstance(value, str) and value.lower() in {"false", "0", "no"}:
        return False
    raise api_error("WRITE_CONTEXT_INVALID", status_code=422, context={"field": field})


def parse_write_context(
    request: Request,
    body_context: dict[str, Any] | None = None,
    *,
    require_write_guard: bool = False,
) -> WriteContext:
    """Parse additive headers/body metadata without changing legacy request shapes."""
    principal = getattr(request.state, "principal", None)
    if principal is not None:
        context = WriteContext(
            actor=principal.actor,
            source=principal.source,
            session_id=principal.session_id,
            base_revision=None,
            confirmed=False,
        )
        body = body_context or {}
        revision_value = request.headers.get("X-RuiWare-Base-Revision") or body.get("baseRevision")
        confirmed_value = request.headers.get("X-RuiWare-Confirmed")
        if confirmed_value is None:
            confirmed_value = body.get("confirmed", False)
        context = WriteContext(
            actor=context.actor,
            source=context.source,
            session_id=context.session_id,
            base_revision=int(revision_value) if revision_value is not None else None,
            confirmed=_bool(confirmed_value, field="confirmed"),
        )
        if require_write_guard and context.actor == "agent":
            if context.base_revision is None:
                raise api_error("WRITE_REVISION_REQUIRED", status_code=422)
            if not context.confirmed:
                raise api_error("WRITE_CONFIRMATION_REQUIRED", status_code=422)
        return context
    body = body_context or {}
    actor_value = "gui"
    source = "gui"
    session_id = None
    revision_value = request.headers.get("X-RuiWare-Base-Revision")
    if revision_value is None:
        revision_value = body.get("baseRevision")
    base_revision: int | None = None
    if revision_value is not None:
        try:
            base_revision = int(revision_value)
        except (TypeError, ValueError) as error:
            raise api_error("WRITE_REVISION_INVALID", status_code=422, context={"baseRevision": revision_value}) from error
        if base_revision < 1:
            raise api_error("WRITE_REVISION_INVALID", status_code=422, context={"baseRevision": base_revision})
    confirmed_value = request.headers.get("X-RuiWare-Confirmed")
    if confirmed_value is None:
        confirmed_value = body.get("confirmed", False)
    confirmed = _bool(confirmed_value, field="confirmed")
    context = WriteContext(
        actor=actor_value,
        source=str(source),
        session_id=str(session_id) if session_id is not None else None,
        base_revision=base_revision,
        confirmed=confirmed,
    )
    if require_write_guard and context.actor == "agent":
        if context.base_revision is None:
            raise api_error("WRITE_REVISION_REQUIRED", status_code=422)
        if not context.confirmed:
            raise api_error("WRITE_CONFIRMATION_REQUIRED", status_code=422)
    return context
