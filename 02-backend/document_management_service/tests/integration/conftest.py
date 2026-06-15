import socket

import pytest
import pytest_asyncio
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from src.config.settings import settings
from src.main import app


@pytest.fixture(scope="session", autouse=True)
def _check_services():
    """Health-check all services. Fail fast with actionable error."""
    errors = []
    for name, host, port in [
        ("PostgreSQL", settings.DB_HOST, settings.DB_PORT),
        ("Temporal", *settings.TEMPORAL.HOST.split(":")),
    ]:
        try:
            sock = socket.create_connection((host, int(port)), timeout=2)
            sock.close()
        except Exception:
            errors.append(f"  - {name} not reachable at {host}:{port}")

    # Storage health check (S3-compatible backend)
    try:
        import urllib.request

        try:
            urllib.request.urlopen(f"{settings.S3_ENDPOINT_URL}/minio/health/live", timeout=5)
        except Exception:
            urllib.request.urlopen(settings.S3_ENDPOINT_URL, timeout=5)
    except Exception:
        errors.append(f"  - S3-compatible storage not reachable at {settings.S3_ENDPOINT_URL}")

    if errors:
        pytest.fail(
            "Required services are not running:\n" + "\n".join(errors) + "\n\nStart them with: docker compose up -d"
        )


@pytest.fixture(autouse=True)
async def db_schema():
    """No-op: shadows root conftest's SQLite schema fixture.

    Integration tests use real PostgreSQL managed by Alembic migrations
    in the lifespan.
    """
    yield


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def integration_client():
    """Real app with full lifespan — storage init, migrations, Temporal worker."""
    async with (
        LifespanManager(app),
        AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client,
    ):
        yield client
