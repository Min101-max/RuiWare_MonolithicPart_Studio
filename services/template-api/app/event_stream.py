"""草稿 SSE 事件流。"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from fastapi import Request

from .events import draft_event_hub, format_sse_event
from .repository import Repository


def _event_id(value: str | None) -> int:
    try:
        return max(0, int(value or "0"))
    except ValueError:
        return 0


async def stream_draft_events(
    repository: Repository,
    draft_id: str,
    request: Request,
    last_event_id: str | None = None,
) -> AsyncIterator[str]:
    subscriber_id, queue = draft_event_hub.subscribe(draft_id)
    current_event_id = _event_id(last_event_id)
    try:
        if last_event_id is not None:
            for event in repository.list_draft_events(draft_id, after_id=current_event_id):
                current_event_id = event.id
                yield format_sse_event(event)

        while not await request.is_disconnected():
            try:
                event = await asyncio.wait_for(queue.get(), timeout=15)
            except asyncio.TimeoutError:
                yield ": keep-alive\n\n"
                continue
            if event.id <= current_event_id:
                continue
            current_event_id = event.id
            yield format_sse_event(event)
    finally:
        draft_event_hub.unsubscribe(subscriber_id)
