from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from audit_client import ChangeType

from src.api.routes import approval_api


@pytest.mark.asyncio
async def test_record_zip_action_writes_action_audit(monkeypatch):
    record_audit_entry = AsyncMock()
    db = SimpleNamespace(commit=AsyncMock())
    project_id = uuid4()
    file_id = uuid4()
    request = object()

    monkeypatch.setattr(approval_api, "record_audit_entry", record_audit_entry)
    monkeypatch.setattr(approval_api, "audit_context_kwargs", lambda _: {"actor_user_id": None})

    await approval_api._record_zip_action(
        SimpleNamespace(db=db),
        project_id=project_id,
        file_id=file_id,
        action_type="set_file_diff",
        request=request,
    )

    record_audit_entry.assert_awaited_once_with(
        db,
        project_id=project_id,
        entity_type="zip_file",
        change_type=ChangeType.ACTION,
        action_type="set_file_diff",
        entity_id=file_id,
        actor_user_id=None,
    )
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_record_zip_action_skips_unscoped_zip(monkeypatch):
    record_audit_entry = AsyncMock()
    db = SimpleNamespace(commit=AsyncMock())

    monkeypatch.setattr(approval_api, "record_audit_entry", record_audit_entry)

    await approval_api._record_zip_action(
        SimpleNamespace(db=db),
        project_id=None,
        file_id=uuid4(),
        action_type="set_file_diff",
        request=object(),
    )

    record_audit_entry.assert_not_awaited()
    db.commit.assert_not_awaited()
