from __future__ import annotations

import asyncio
from collections.abc import Mapping

import httpx
import pytest
from audit_client.context import audit_context_scope, parse_audit_headers
from audit_client.forwarding import merge_audit_headers

AUDIT_HEADER_NAMES = {
    "x-actor-user-id",
    "x-triggered-by-user-id",
    "x-workflow-run-id",
    "x-workflow-type",
    "x-request-starttime",
    "x-request-id",
}
NO_CONTENT = 204


async def _capture_real_http_request(headers: Mapping[str, str]) -> dict[str, str]:
    request_received: asyncio.Future[dict[str, str]] = asyncio.get_running_loop().create_future()

    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            raw = await reader.readuntil(b"\r\n\r\n")
            lines = raw.decode("ascii").split("\r\n")[1:]
            parsed = {
                name.strip().lower(): value.strip()
                for line in lines
                if line and ":" in line
                for name, value in [line.split(":", 1)]
            }
            if not request_received.done():
                request_received.set_result(parsed)
            writer.write(b"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            await writer.drain()
        finally:
            writer.close()
            await writer.wait_closed()

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    socket = server.sockets[0]
    port = socket.getsockname()[1]
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"http://127.0.0.1:{port}/capture", headers=headers)
            assert response.status_code == NO_CONTENT
        return await asyncio.wait_for(request_received, timeout=2)
    finally:
        server.close()
        await server.wait_closed()


@pytest.mark.asyncio
async def test_real_client_forwards_only_canonical_context_and_casefolded_override() -> None:
    context = parse_audit_headers(
        {
            "X-Actor-User-Id": "11111111-1111-4111-8111-111111111111",
            "X-Triggered-By-User-Id": "22222222-2222-4222-8222-222222222222",
            "X-Workflow-Run-Id": "run-17",
            "X-Workflow-Type": "DocumentWorkflow",
            "X-Request-Starttime": "2026-07-16T10:00:00Z",
            "X-Request-Id": "33333333-3333-4333-8333-333333333333",
        }
    )
    override = "44444444-4444-4444-8444-444444444444"

    with audit_context_scope(forwarded=context):
        received = await _capture_real_http_request(
            merge_audit_headers({"x-aCtOr-UsEr-Id": override, "X-Ordinary": "kept"})
        )

    audit = {name: value for name, value in received.items() if name in AUDIT_HEADER_NAMES}
    assert audit == {
        "x-actor-user-id": override,
        "x-triggered-by-user-id": "22222222-2222-4222-8222-222222222222",
        "x-workflow-run-id": "run-17",
        "x-workflow-type": "DocumentWorkflow",
        "x-request-starttime": "2026-07-16T10:00:00.000Z",
        "x-request-id": "33333333-3333-4333-8333-333333333333",
    }
    assert received["x-ordinary"] == "kept"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "headers",
    [
        {},
        {
            "X-Actor-User-Id": "not-a-uuid",
            "X-Request-Starttime": "not-a-time",
            "X-Request-Id": "not-a-uuid",
        },
    ],
)
async def test_absent_or_invalid_context_is_omitted(headers: dict[str, str]) -> None:
    with audit_context_scope(forwarded=parse_audit_headers(headers)):
        received = await _capture_real_http_request(merge_audit_headers(None))

    assert AUDIT_HEADER_NAMES.isdisjoint(received)
