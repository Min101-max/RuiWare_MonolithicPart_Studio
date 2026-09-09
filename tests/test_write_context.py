import pytest
from starlette.requests import Request

from app.errors import ApiError
from app.security import Principal
from app.services.write_context import WriteContext, parse_write_context


def _request(headers: dict[str, str] | None = None) -> Request:
    raw = [(key.lower().encode(), value.encode()) for key, value in (headers or {}).items()]
    return Request({"type": "http", "method": "POST", "path": "/", "headers": raw})


def test_parse_write_context_defaults_to_gui() -> None:
    context = parse_write_context(_request())

    assert context == WriteContext(actor="gui", source="gui", session_id=None, base_revision=None, confirmed=False)


def test_parse_write_context_ignores_unverified_actor_headers() -> None:
    context = parse_write_context(_request({
        "X-RuiWare-Actor": "agent",
        "X-RuiWare-Source": "mcp",
        "X-RuiWare-Session": "session-1",
        "X-RuiWare-Base-Revision": "4",
        "X-RuiWare-Confirmed": "true",
    }))

    assert context.actor == "gui"
    assert context.source == "gui"
    assert context.session_id is None
    assert context.base_revision == 4
    assert context.confirmed is True


def test_parse_write_context_rejects_malformed_revision() -> None:
    with pytest.raises(ApiError) as raised:
        parse_write_context(_request({"X-RuiWare-Base-Revision": "not-a-number"}))

    assert raised.value.detail["code"] == "WRITE_REVISION_INVALID"


def test_agent_write_requires_revision_and_confirmation() -> None:
    request = _request()
    request.state.principal = Principal("agent", "mcp", "agent-session", "agent-owner")
    with pytest.raises(ApiError) as raised:
        parse_write_context(request, require_write_guard=True)

    assert raised.value.detail["code"] == "WRITE_REVISION_REQUIRED"

    request = _request()
    request.state.principal = Principal("agent", "mcp", "agent-session", "agent-owner")
    with pytest.raises(ApiError) as raised:
        parse_write_context(request, {"baseRevision": 1}, require_write_guard=True)

    assert raised.value.detail["code"] == "WRITE_CONFIRMATION_REQUIRED"
