"""Tests for the actor_user_id ContextVar mechanism in audit-client."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from audit_client.client import record_audit_entry
from audit_client.enums import ChangeType
from audit_client.forwarding import actor_user_id_ctx
from sqlalchemy.ext.asyncio import AsyncSession


def _active_session() -> MagicMock:
    session = MagicMock(spec=AsyncSession)
    session.in_transaction.return_value = True
    session.execute = AsyncMock()
    return session


def test_set_and_read_actor_user_id_context():
    user_id = uuid4()
    assert actor_user_id_ctx.get() is None

    token = actor_user_id_ctx.set(user_id)
    assert actor_user_id_ctx.get() == user_id

    actor_user_id_ctx.reset(token)
    assert actor_user_id_ctx.get() is None


def test_nested_context_vars_are_isolated():
    outer_id = uuid4()
    inner_id = uuid4()

    outer_token = actor_user_id_ctx.set(outer_id)
    inner_token = actor_user_id_ctx.set(inner_id)
    assert actor_user_id_ctx.get() == inner_id

    actor_user_id_ctx.reset(inner_token)
    assert actor_user_id_ctx.get() == outer_id

    actor_user_id_ctx.reset(outer_token)
    assert actor_user_id_ctx.get() is None


@pytest.mark.asyncio
async def test_record_audit_entry_uses_context_var_when_actor_not_passed():
    actor_id = uuid4()
    session = _active_session()

    token = actor_user_id_ctx.set(actor_id)
    try:
        await record_audit_entry(
            session,
            project_id=uuid4(),
            entity_type="project",
            change_type=ChangeType.CREATE,
        )
    finally:
        actor_user_id_ctx.reset(token)

    call_kwargs = session.execute.call_args[0][0].compile().params
    assert call_kwargs["actor_user_id"] == actor_id


@pytest.mark.asyncio
async def test_record_audit_entry_explicit_actor_overrides_context_var():
    context_id = uuid4()
    explicit_id = uuid4()
    session = _active_session()

    token = actor_user_id_ctx.set(context_id)
    try:
        await record_audit_entry(
            session,
            project_id=uuid4(),
            entity_type="project",
            change_type=ChangeType.CREATE,
            actor_user_id=explicit_id,
        )
    finally:
        actor_user_id_ctx.reset(token)

    call_kwargs = session.execute.call_args[0][0].compile().params
    assert call_kwargs["actor_user_id"] == explicit_id


@pytest.mark.asyncio
async def test_record_audit_entry_no_context_no_explicit_actor_is_none():
    session = _active_session()

    await record_audit_entry(
        session,
        project_id=uuid4(),
        entity_type="project",
        change_type=ChangeType.CREATE,
    )

    call_kwargs = session.execute.call_args[0][0].compile().params
    assert call_kwargs["actor_user_id"] is None
