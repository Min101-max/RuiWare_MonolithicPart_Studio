"""草稿变更事件及进程内实时广播。"""

from __future__ import annotations

import asyncio
import json
import threading
from dataclasses import dataclass
from typing import Any

from template_core.models import TemplateDraft


@dataclass(frozen=True)
class DraftChangedEvent:
    id: int
    draft_id: str
    revision: int
    actor: str
    source: str
    operation: str
    session_id: str | None
    created_at: str
    summary: dict[str, Any]

    def payload(self) -> dict[str, object]:
        return {
            "draftId": self.draft_id,
            "revision": self.revision,
            "actor": self.actor,
            "source": self.source,
            "operation": self.operation,
            "summary": self.summary,
        }


def _collection_changes(before: list[Any], after: list[Any], label_key: str) -> list[dict[str, Any]]:
    before_by_id = {item.id: item.model_dump(mode="json") for item in before}
    after_by_id = {item.id: item.model_dump(mode="json") for item in after}
    changes: list[dict[str, Any]] = []
    for item_id in sorted(set(before_by_id) | set(after_by_id)):
        previous = before_by_id.get(item_id)
        current = after_by_id.get(item_id)
        if previous == current:
            continue
        changes.append({
            "id": item_id,
            "label": (current or previous or {}).get(label_key) or item_id,
            "changeType": "added" if previous is None else "removed" if current is None else "updated",
            "before": previous,
            "after": current,
        })
    return changes


def summarize_draft_change(
    before: TemplateDraft | None,
    after: TemplateDraft,
    *,
    from_revision: int | None,
    affected_stages: list[str],
) -> dict[str, Any]:
    """生成可供 GUI 和 Agent 阅读的有限范围版本差异摘要。"""
    if before is None:
        parameter_changes: list[dict[str, Any]] = []
        rule_changes: list[dict[str, Any]] = []
        sketch_changed = False
        sketch_parts: list[str] = []
    else:
        parameter_changes = _collection_changes(before.parameterDefinitions, after.parameterDefinitions, "label")
        rule_changes = _collection_changes(before.featureRules, after.featureRules, "name")
        before_sketch = before.sketch.model_dump(mode="json")
        after_sketch = after.sketch.model_dump(mode="json")
        sketch_parts = [key for key in ("entities", "constraints", "regions", "drivingParameters", "plane", "profileMode", "constraintsReviewed", "conversionReviewed") if before_sketch.get(key) != after_sketch.get(key)]
        sketch_changed = bool(sketch_parts)
    return {
        "fromRevision": from_revision,
        "toRevision": after.revision,
        "parameters": parameter_changes,
        "rules": rule_changes,
        "sketch": {"changed": sketch_changed, "parts": sketch_parts},
        "affectedStages": affected_stages,
    }


class DraftEventHub:
    """把已提交的草稿事件推送给当前 API 进程中的 SSE 客户端。"""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subscribers: dict[str, tuple[str, asyncio.AbstractEventLoop, asyncio.Queue[DraftChangedEvent]]] = {}

    def subscribe(self, draft_id: str) -> tuple[str, asyncio.Queue[DraftChangedEvent]]:
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[DraftChangedEvent] = asyncio.Queue()
        subscriber_id = f"subscriber-{id(queue)}"
        with self._lock:
            self._subscribers[subscriber_id] = (draft_id, loop, queue)
        return subscriber_id, queue

    def unsubscribe(self, subscriber_id: str) -> None:
        with self._lock:
            self._subscribers.pop(subscriber_id, None)

    def publish(self, event: DraftChangedEvent) -> None:
        with self._lock:
            subscribers = list(self._subscribers.values())
        for draft_id, loop, queue in subscribers:
            if draft_id != event.draft_id:
                continue
            try:
                loop.call_soon_threadsafe(queue.put_nowait, event)
            except RuntimeError:
                continue


draft_event_hub = DraftEventHub()


def publish_draft_changed(event: DraftChangedEvent) -> None:
    draft_event_hub.publish(event)


def format_sse_event(event: DraftChangedEvent) -> str:
    data = json.dumps(event.payload(), ensure_ascii=False, separators=(",", ":"))
    return f"id: {event.id}\nevent: draft.changed\ndata: {data}\n\n"
