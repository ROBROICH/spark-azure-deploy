from collections.abc import Callable
from datetime import UTC, datetime

import httpx
import pytest
from temporal.contracts import WorkflowStatusEvent
from temporal.tracking_client import TrackingClient

pytestmark = pytest.mark.asyncio


def _make_client(
    handler: Callable[[httpx.Request], httpx.Response],
    base_url: str = "http://api",
) -> TrackingClient:
    client = TrackingClient(base_url=base_url)
    client._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return client


async def test_post_status_hits_endpoint_with_payload() -> None:
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["method"] = request.method
        seen["body"] = request.read().decode()
        return httpx.Response(204)

    client = _make_client(handler)
    try:
        await client.post_status(
            WorkflowStatusEvent(
                workflow_id="wf",
                run_id="run",
                workflow_type="T",
                timestamp=datetime.now(UTC),
                status="pending",
            )
        )
    finally:
        await client.aclose()

    assert seen["method"] == "POST"
    assert seen["url"] == "http://api/internal/workflows/status"
    assert '"workflowId":"wf"' in seen["body"]
    assert '"status":"pending"' in seen["body"]


async def test_post_status_serializes_optional_fields() -> None:
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = request.read().decode()
        return httpx.Response(204)

    client = _make_client(handler)
    try:
        await client.post_status(
            WorkflowStatusEvent(
                workflow_id="wf",
                run_id="run",
                workflow_type="T",
                timestamp=datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC),
                status="completed",
                project_id="11111111-1111-1111-1111-111111111111",
                project_version=3,
                history_s3_key="s3://bucket/key",
                failure_message="boom",
            )
        )
    finally:
        await client.aclose()

    body = seen["body"]
    assert '"projectId":"11111111-1111-1111-1111-111111111111"' in body
    assert '"projectVersion":3' in body
    assert '"historyS3Key":"s3://bucket/key"' in body
    assert '"failureMessage":"boom"' in body


async def test_base_url_trailing_slash_is_stripped() -> None:
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        return httpx.Response(204)

    client = _make_client(handler, base_url="http://api/")
    try:
        await client.post_status(
            WorkflowStatusEvent(
                workflow_id="wf",
                run_id="run",
                status="pending",
                workflow_type="T",
                timestamp=datetime.now(UTC),
            )
        )
    finally:
        await client.aclose()

    assert seen["url"] == "http://api/internal/workflows/status"
