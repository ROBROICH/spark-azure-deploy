from __future__ import annotations

import asyncio
import io
import json
from pathlib import Path
from typing import Any

import httpx
import pytest
from event_logging.context import project_id_var, request_context, trace_id_var
from event_logging.event_logger import EventLogger
from event_logging.middleware import (
    EventLoggingMiddleware,
    event_action_for_method,
    event_outcome_for_status,
    extract_trace_id,
    request_message,
    request_path,
    resolve_project_id,
)
from fastapi import FastAPI, Request
from sqlalchemy.exc import IntegrityError
from starlette import status

FIXTURES = Path(__file__).parents[1] / "fixtures" / "core"
FIXED_TIMESTAMP = "2026-07-16T12:34:56.789Z"
EXPECTED_EVENTS = 3
EXPECTED_DURATION_NS = 42


def _read_fixture(name: str) -> Any:
    with (FIXTURES / name).open(encoding="utf-8") as fixture:
        return json.load(fixture)


@pytest.mark.parametrize("case", _read_fixture("traceparent.json"), ids=lambda case: case["name"])
def test_python_traceparent_contract(case: dict[str, Any]) -> None:
    assert extract_trace_id(case["value"]) == case["expected_trace_id"]


@pytest.mark.parametrize("case", _read_fixture("http.json"), ids=lambda case: case["name"])
def test_python_http_classification_and_protected_values(case: dict[str, Any]) -> None:
    path = request_path(case["url"])
    observable = {
        "action": event_action_for_method(case["method"]).value,
        "outcome": event_outcome_for_status(case["status"]).value,
        "project_id": resolve_project_id(case["path_params"], case["query"]),
        "path": path,
        "message": request_message(case["method"], case["status"], path),
    }

    assert observable == case["expected"]
    serialized = json.dumps(observable)
    for protected_value in case["forbidden"]:
        assert protected_value not in serialized


def test_python_request_context_isolated_across_concurrent_success_failure_and_reset() -> None:
    async def observe(project_id: str, trace_id: str, fail: bool = False) -> tuple[str | None, str | None]:
        try:
            with request_context(project_id=project_id, trace_id=trace_id):
                await asyncio.sleep(0)
                observed = (project_id_var.get(), trace_id_var.get())
                if fail:
                    raise RuntimeError("fixture failure")
                await asyncio.sleep(0)
                return observed
        except RuntimeError:
            return observed

    async def run() -> list[tuple[str | None, str | None]]:
        return await asyncio.gather(
            observe("project-a", "trace-a"),
            observe("project-b", "trace-b", fail=True),
        )

    assert asyncio.run(run()) == [("project-a", "trace-a"), ("project-b", "trace-b")]
    assert project_id_var.get() is None
    assert trace_id_var.get() is None


def test_fastapi_middleware_concurrent_success_failure_and_post_request_reset() -> None:
    stream = io.StringIO()
    logger = EventLogger(
        service_name="fixture-service",
        stream=stream,
        timestamp_factory=lambda: FIXED_TIMESTAMP,
    )
    app = FastAPI()

    @app.get("/projects/{project_id}")
    async def success(project_id: str) -> dict[str, str | None]:
        await asyncio.sleep(0)
        return {"project_id": project_id_var.get(), "trace_id": trace_id_var.get()}

    @app.get("/fail/{project_id}")
    async def failure(project_id: str) -> None:
        await asyncio.sleep(0)
        assert project_id_var.get() == project_id
        assert trace_id_var.get() == "generated-trace-id"
        raise RuntimeError(f"failure-{project_id}")

    @app.get("/healthz")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/metrics")
    async def metrics() -> dict[str, str]:
        return {"status": "ok"}

    app.add_middleware(
        EventLoggingMiddleware,
        service_name="fixture-service",
        logger=logger,
        trace_id_factory=lambda: "generated-trace-id",
    )

    async def run() -> tuple[httpx.Response, httpx.Response, httpx.Response, httpx.Response]:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            success_response, failure_response = await asyncio.gather(
                client.get(
                    "/projects/project-a?access_token=secret-token",
                    headers={
                        "traceparent": "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
                        "authorization": "Bearer bearer-secret",
                    },
                ),
                client.get(
                    "/fail/project-b?X-Goog-Signature=signed-secret",
                    headers={"cookie": "session=cookie-secret"},
                ),
            )
            health_response = await client.get("/healthz")
            metrics_response = await client.get("/metrics")
            return success_response, failure_response, health_response, metrics_response

    success_response, failure_response, health_response, metrics_response = asyncio.run(run())

    assert success_response.status_code == status.HTTP_200_OK
    assert success_response.json() == {
        "project_id": "project-a",
        "trace_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }
    assert failure_response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert health_response.status_code == status.HTTP_200_OK
    assert metrics_response.status_code == status.HTTP_200_OK
    events = [json.loads(line) for line in stream.getvalue().splitlines()]
    by_project = {event["project_id"]: event for event in events}
    assert by_project.keys() == {"project-a", "project-b"}
    assert by_project["project-a"]["event.outcome"] == "success"
    assert by_project["project-b"]["event.outcome"] == "failure"
    assert by_project["project-a"]["trace.id"] == "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    assert by_project["project-b"]["trace.id"] == "generated-trace-id"
    assert all(isinstance(event["event.duration"], int) and event["event.duration"] >= 0 for event in events)
    serialized = json.dumps(events)
    for secret in (
        "secret-token",
        "bearer-secret",
        "signed-secret",
        "cookie-secret",
    ):
        assert secret not in serialized
    assert project_id_var.get() is None
    assert trace_id_var.get() is None


def test_fastapi_middleware_takes_project_id_from_path_and_query_and_never_from_body() -> None:
    stream = io.StringIO()
    logger = EventLogger(
        service_name="fixture-service",
        stream=stream,
        timestamp_factory=lambda: FIXED_TIMESTAMP,
    )
    app = FastAPI()

    @app.post("/items")
    async def create_item(request: Request) -> dict[str, Any]:
        return {"body": await request.json(), "project_id": project_id_var.get()}

    app.add_middleware(EventLoggingMiddleware, service_name="fixture-service", logger=logger)
    body = {"projectId": "body-project", "client_secret": "client-secret"}

    async def run() -> list[httpx.Response]:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return [
                await client.post("/items", json=body),
                await client.post("/items?projectId=query-project", json=body),
            ]

    body_only, with_query = asyncio.run(run())

    assert body_only.json() == {"body": body, "project_id": None}
    assert with_query.json() == {"body": body, "project_id": "query-project"}
    events = [json.loads(line) for line in stream.getvalue().splitlines()]
    assert [event.get("project_id") for event in events] == [None, "query-project"]
    assert "body-project" not in stream.getvalue()
    assert "client-secret" not in stream.getvalue()


def test_fastapi_middleware_redacts_database_bind_values_and_preserves_application_errors() -> None:
    private_values = {
        "title": "title-SENTINEL-4403",
        "description": "description-SENTINEL-4403",
        "note_id": "11111111-2222-4333-8444-555555555555",
        "rating": "rating-SENTINEL-4403",
        "status": "status-SENTINEL-4403",
    }
    driver_message = (
        'duplicate key value violates unique constraint "notes_pkey"\n'
        f"DETAIL:  Key (note_id)=({private_values['note_id']}) already exists."
    )
    stream = io.StringIO()
    logger = EventLogger(
        service_name="fixture-service",
        stream=stream,
        timestamp_factory=lambda: FIXED_TIMESTAMP,
    )
    app = FastAPI()

    class UniqueViolationError(RuntimeError):
        pgcode = "23505"

    class MalformedDatabaseError(RuntimeError):
        @property
        def orig(self) -> BaseException:
            raise RuntimeError("unreadable database cause")

    @app.get("/projects/{project_id}/sqlalchemy-error")
    async def sqlalchemy_error(project_id: str) -> None:
        raise IntegrityError(
            "INSERT INTO notes (title, description, note_id, rating, status) "
            "VALUES (%(title)s, %(description)s, %(note_id)s, %(rating)s, %(status)s)",
            private_values,
            UniqueViolationError(driver_message),
        )

    @app.get("/projects/{project_id}/malformed-database-error")
    async def malformed_database_error(project_id: str) -> None:
        rendered_values = ",".join(private_values.values())
        raise MalformedDatabaseError(f"Failed query: INSERT INTO notes VALUES (...)\nparams: {rendered_values}")

    @app.get("/projects/{project_id}/application-error")
    async def application_error(project_id: str) -> None:
        raise RuntimeError("meaningful application failure")

    app.add_middleware(
        EventLoggingMiddleware,
        service_name="fixture-service",
        logger=logger,
        trace_id_factory=lambda: "request-redaction-trace",
    )

    async def run() -> list[httpx.Response]:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return [
                await client.get("/projects/context-project/sqlalchemy-error"),
                await client.get("/projects/context-project/malformed-database-error"),
                await client.get("/projects/context-project/application-error"),
            ]

    responses = asyncio.run(run())
    assert [response.status_code for response in responses] == [
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        status.HTTP_500_INTERNAL_SERVER_ERROR,
    ]

    events = [json.loads(line) for line in stream.getvalue().splitlines()]
    assert len(events) == EXPECTED_EVENTS
    by_path = {event["url.path"]: event for event in events}
    sqlalchemy_event = by_path["/projects/context-project/sqlalchemy-error"]
    malformed_event = by_path["/projects/context-project/malformed-database-error"]
    application_event = by_path["/projects/context-project/application-error"]

    assert sqlalchemy_event["error.message"] == "UniqueViolationError (SQLSTATE 23505)"
    assert malformed_event["error.message"] == "Database operation failed"
    assert application_event["error.message"] == "meaningful application failure"
    for path, event in by_path.items():
        assert event["event.outcome"] == "failure"
        assert event["message"] == f"GET : {path} executed."
        assert event["project_id"] == "context-project"
        assert event["trace.id"] == "request-redaction-trace"
        assert "event.code" not in event

    serialized = stream.getvalue()
    assert "params:" not in serialized
    assert "parameters:" not in serialized
    for private_value in private_values.values():
        assert private_value not in serialized
    assert project_id_var.get() is None
    assert trace_id_var.get() is None


def test_fastapi_middleware_uses_injected_nanosecond_clock() -> None:
    stream = io.StringIO()
    ticks = iter((1_000_000_000, 1_000_000_042))
    logger = EventLogger(
        service_name="fixture-service",
        stream=stream,
        timestamp_factory=lambda: FIXED_TIMESTAMP,
    )
    app = FastAPI()

    @app.get("/duration")
    async def duration() -> dict[str, str]:
        return {"status": "ok"}

    app.add_middleware(
        EventLoggingMiddleware,
        service_name="fixture-service",
        logger=logger,
        clock_ns=lambda: next(ticks),
    )

    async def run() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get("/duration")

    response = asyncio.run(run())
    assert response.status_code == status.HTTP_200_OK
    assert json.loads(stream.getvalue())["event.duration"] == EXPECTED_DURATION_NS
