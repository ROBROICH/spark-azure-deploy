import json
from collections.abc import AsyncGenerator, Generator
from typing import Any, override
from uuid import uuid4

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport
from py_pglite.config import PGliteConfig
from py_pglite.sqlalchemy.manager import SQLAlchemyPGliteManager
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from syrupy.assertion import SnapshotAssertion
from syrupy.extensions.single_file import SingleFileSnapshotExtension, WriteMode

# Env vars required to import ``src`` modules are set by the parent ``tests/conftest.py``,
# which pytest always loads before this package-level conftest. The ``src`` imports below
# (in the ``pglite`` and ``api_client`` fixtures) therefore resolve safely at fixture
# call time.
from src.db.database import get_db_session
from src.main import app
from src.models.db.prufung_models import Base

pytestmark = pytest.mark.integration


class JSONSnapshotExtension(SingleFileSnapshotExtension):
    _file_extension = "json"
    _write_mode = WriteMode.TEXT

    @override
    def serialize(
        self,
        data: Any,
        *,
        exclude: Any = None,
        include: Any = None,
        matcher: Any = None,
    ) -> str:
        return json.dumps(data, indent=2, sort_keys=True, default=str)


@pytest.fixture
def snapshot_json(snapshot: SnapshotAssertion) -> SnapshotAssertion:
    return snapshot.use_extension(JSONSnapshotExtension)


def gen_id(ids: dict[str, str], label: str) -> str:
    """Generate a random UUID and register it with a label for normalization."""
    uid = str(uuid4())
    ids[uid] = label
    return uid


def normalize(data: Any, ids: dict[str, str]) -> Any:
    """Recursively replace known UUIDs with labels, timestamps with placeholders."""
    if isinstance(data, str) and data in ids:
        return ids[data]
    if isinstance(data, dict):
        result = {}
        for key, value in data.items():
            if key in ("created_at", "updated_at"):
                result[key] = "<TIMESTAMP>"
            elif isinstance(value, str) and value in ids:
                result[key] = ids[value]
            else:
                result[key] = normalize(value, ids)
        return result
    if isinstance(data, list):
        items = [normalize(item, ids) for item in data]
        if items and all(isinstance(x, dict) and "id" in x for x in items):
            items.sort(key=lambda x: str(x["id"]))
        return items
    return data


async def post_inserts(client: httpx.AsyncClient, project_id: str, inserts: list[dict[str, Any]]) -> Any:
    resp = await client.post(
        f"/{project_id}/update",
        json={"inserts": inserts, "updates": [], "deletes": []},
    )
    resp.raise_for_status()
    return resp.json()


@pytest.fixture(scope="session")
def pglite() -> Generator[SQLAlchemyPGliteManager]:
    """Start PGlite and create all tables once per session."""
    manager = SQLAlchemyPGliteManager(PGliteConfig())
    manager.start()
    manager.wait_for_ready()

    # Create tables with the sync engine, then free the connection for async use
    engine = manager.get_engine()
    Base.metadata.create_all(engine)
    engine.dispose()
    manager._shared_engine = None

    yield manager
    manager.stop()


@pytest.fixture(scope="session")
def _db_session_factory(pglite: SQLAlchemyPGliteManager) -> async_sessionmaker[AsyncSession]:
    """Async session factory backed by PGlite (psycopg driver, Unix socket)."""
    url = pglite.config.get_connection_string(driver="psycopg")
    engine = create_async_engine(
        url,
        poolclass=StaticPool,
        connect_args={"prepare_threshold": None},
    )
    return async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture
async def api_client(_db_session_factory: async_sessionmaker[AsyncSession]) -> AsyncGenerator[httpx.AsyncClient]:
    """Async HTTP client talking to FastAPI in-process, backed by PGlite."""

    async def override_get_db() -> AsyncGenerator[AsyncSession]:
        async with _db_session_factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = override_get_db
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def ids() -> dict[str, str]:
    """Per-test UUID->label mapping for snapshot normalization."""
    return {}


@pytest_asyncio.fixture
async def project_id(api_client: httpx.AsyncClient, ids: dict[str, str]) -> AsyncGenerator[str]:
    pid = gen_id(ids, "<PROJECT>")
    await post_inserts(api_client, pid, [{"node_type": "project", "id": pid, "payload": {}}])
    yield pid
    await api_client.post(
        f"/{pid}/update",
        json={"inserts": [], "updates": [], "deletes": [{"node_type": "project", "id": pid}]},
    )
