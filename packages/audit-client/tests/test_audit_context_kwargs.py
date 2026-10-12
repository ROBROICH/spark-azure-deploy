"""Tests for audit_context_kwargs — header vs. ContextVar fallback."""

from uuid import uuid4

from audit_client.forwarding import actor_user_id_ctx
from audit_client.middleware import AuditContextMiddleware, audit_context_kwargs
from fastapi import FastAPI
from starlette.requests import Request
from starlette.testclient import TestClient


def _make_request(headers: dict[str, str] | None = None) -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
        "query_string": b"",
    }
    return Request(scope)


def test_falls_back_to_context_var_when_header_absent():
    user_id = uuid4()
    token = actor_user_id_ctx.set(user_id)
    try:
        request = _make_request()
        result = audit_context_kwargs(request)
    finally:
        actor_user_id_ctx.reset(token)

    assert result["actor_user_id"] == user_id


def test_header_wins_over_context_var():
    header_id = uuid4()
    ctx_id = uuid4()
    token = actor_user_id_ctx.set(ctx_id)
    try:
        request = _make_request({"X-Actor-User-Id": str(header_id)})
        # Simulate what AuditContextMiddleware does: parse header into request.state
        request.state.actor_user_id = header_id
        result = audit_context_kwargs(request)
    finally:
        actor_user_id_ctx.reset(token)

    assert result["actor_user_id"] == header_id


def test_returns_none_when_both_absent():
    request = _make_request()
    result = audit_context_kwargs(request)

    assert result["actor_user_id"] is None


def test_middleware_sets_context_var_from_header():
    """AuditContextMiddleware populates actor_user_id_ctx from the X-Actor-User-Id header."""
    user_id = uuid4()
    captured: list = []

    app = FastAPI()
    app.add_middleware(AuditContextMiddleware)

    @app.get("/probe")
    async def probe():
        captured.append(actor_user_id_ctx.get())
        return {}

    with TestClient(app, headers={"X-Actor-User-Id": str(user_id)}) as client:
        client.get("/probe")

    assert captured[0] == user_id


def test_full_browser_request_path():
    """No X-Actor-User-Id header; audit_context_kwargs reads from ContextVar set by dependency."""
    user_id = uuid4()
    captured: list = []

    app = FastAPI()
    app.add_middleware(AuditContextMiddleware)

    @app.get("/probe")
    async def probe():
        # Simulate what audit_actor_dependency does
        token = actor_user_id_ctx.set(user_id)
        try:
            from starlette.requests import Request as R

            # audit_context_kwargs is normally called with the real request object
            # Here we build a minimal one that has no actor header in state
            scope = {
                "type": "http",
                "method": "GET",
                "path": "/probe",
                "headers": [],
                "query_string": b"",
            }
            req = R(scope)
            captured.append(audit_context_kwargs(req))
        finally:
            actor_user_id_ctx.reset(token)
        return {}

    with TestClient(app) as client:
        client.get("/probe")

    assert captured[0]["actor_user_id"] == user_id
