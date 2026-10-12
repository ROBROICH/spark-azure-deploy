from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from uuid import UUID

import pytest
from audit_client.context import (
    AuditContext,
    audit_context_scope,
    current_audit_context,
    isolated_audit_context_scope,
    parse_audit_headers,
)
from audit_client.forwarding import audit_headers, bearer_token_ctx

CONCURRENT_TASK_COUNT = 2


def _actor_context(actor: str, request_id: str):
    return parse_audit_headers(
        {
            "X-Actor-User-Id": actor,
            "X-Request-Id": request_id,
        }
    )


@pytest.mark.asyncio
async def test_concurrent_tasks_do_not_leak_attribution() -> None:
    first = _actor_context(
        "11111111-1111-4111-8111-111111111111",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    )
    second = _actor_context(
        "22222222-2222-4222-8222-222222222222",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    )
    both_ready = asyncio.Event()
    arrivals = 0
    arrival_lock = asyncio.Lock()

    async def observe(context):
        nonlocal arrivals
        with audit_context_scope(forwarded=context):
            async with arrival_lock:
                arrivals += 1
                if arrivals == CONCURRENT_TASK_COUNT:
                    both_ready.set()
            await both_ready.wait()
            await asyncio.sleep(0)
            return audit_headers(current_audit_context())

    first_result, second_result = await asyncio.gather(observe(first), observe(second))

    assert first_result == audit_headers(first)
    assert second_result == audit_headers(second)
    assert current_audit_context() == parse_audit_headers({})


@pytest.mark.asyncio
async def test_nested_failure_restores_outer_and_post_cleanup_is_empty() -> None:
    outer = _actor_context(
        "33333333-3333-4333-8333-333333333333",
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    )
    inner = _actor_context(
        "44444444-4444-4444-8444-444444444444",
        "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    )

    with audit_context_scope(forwarded=outer):
        assert audit_headers(current_audit_context()) == audit_headers(outer)
        with audit_context_scope(forwarded=inner):
            assert audit_headers(current_audit_context()) == audit_headers(inner)
        assert audit_headers(current_audit_context()) == audit_headers(outer)
        with (
            pytest.raises(RuntimeError, match="deliberate failure"),
            audit_context_scope(active=inner),
        ):
            await asyncio.sleep(0)
            assert audit_headers(current_audit_context()) == audit_headers(inner)
            raise RuntimeError("deliberate failure")
        assert audit_headers(current_audit_context()) == audit_headers(outer)

    await asyncio.sleep(0)
    assert audit_headers(current_audit_context()) == {}

    async def work_created_after_cleanup() -> dict[str, str]:
        await asyncio.sleep(0)
        return audit_headers(current_audit_context())

    assert await asyncio.create_task(work_created_after_cleanup()) == {}


def test_explicit_context_rejects_untyped_or_naive_values() -> None:
    with pytest.raises(ValueError, match="actor_user_id"):
        AuditContext(actor_user_id="not-typed")  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="timezone"):
        AuditContext(request_start_time=datetime(2026, 7, 16))


@pytest.mark.asyncio
async def test_isolated_scope_clears_absent_fields_and_token_then_restores_outer() -> None:
    outer = AuditContext(
        actor_user_id=UUID("11111111-1111-4111-8111-111111111111"),
        triggered_by_user_id=UUID("22222222-2222-4222-8222-222222222222"),
        workflow_run_id="outer-run",
        workflow_type="OuterWorkflow",
        request_start_time=datetime(2026, 7, 16, 10, 11, 12, tzinfo=UTC),
        request_id="33333333-3333-4333-8333-333333333333",
    )
    isolated = AuditContext(request_id="44444444-4444-4444-8444-444444444444")
    bearer = bearer_token_ctx.set("must-not-flow")
    try:
        with audit_context_scope(active=outer):
            with (
                pytest.raises(RuntimeError, match="isolated failure"),
                isolated_audit_context_scope(isolated),
            ):
                await asyncio.sleep(0)
                assert current_audit_context() == isolated
                assert bearer_token_ctx.get() is None
                raise RuntimeError("isolated failure")
            assert current_audit_context() == outer
            assert bearer_token_ctx.get() == "must-not-flow"
    finally:
        bearer_token_ctx.reset(bearer)
    assert current_audit_context() == AuditContext()
