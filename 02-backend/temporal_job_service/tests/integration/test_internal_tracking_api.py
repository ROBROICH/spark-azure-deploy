from datetime import UTC, datetime

import httpx
import pytest
from fastapi import status
from httpx import ASGITransport
from sqlalchemy.ext.asyncio import async_sessionmaker

from src.main import create_app
from src.models.db.database import get_db_session
from src.models.db_models import Base

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


@pytest.fixture
async def client(pg_dsn):
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine(pg_dsn)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session = async_sessionmaker(engine, expire_on_commit=False)

    async def _override_session():
        async with session() as s:
            yield s

    app = create_app()
    app.dependency_overrides[get_db_session] = _override_session
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


async def test_pending_then_running_then_terminal(client):
    body = {
        "workflow_id": "wf",
        "run_id": "run",
        "workflow_type": "T",
        "start_time": datetime.now(UTC).isoformat(),
    }
    r = await client.post("/internal/workflows/pending", json=body)
    assert r.status_code == status.HTTP_204_NO_CONTENT

    r = await client.post(
        "/internal/workflows/running",
        json={"workflow_id": "wf", "run_id": "run"},
    )
    assert r.status_code == status.HTTP_204_NO_CONTENT

    r = await client.post(
        "/internal/workflows/terminal",
        json={
            "workflow_id": "wf",
            "run_id": "run",
            "status": "completed",
            "end_time": datetime.now(UTC).isoformat(),
            "history_s3_key": "k.json.gz",
        },
    )
    assert r.status_code == status.HTTP_204_NO_CONTENT


async def test_rejects_missing_auth(client):
    r = await client.post(
        "/internal/workflows/running",
        json={"workflow_id": "wf", "run_id": "run"},
    )
    assert r.status_code == status.HTTP_401_UNAUTHORIZED
