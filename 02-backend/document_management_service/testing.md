# Integration Testing Guide

Unit tests run against in-memory SQLite with fake env vars — no services needed. Integration tests hit real PostgreSQL, MinIO, and Temporal with zero mocks or dependency overrides. This guide explains how to set up integration tests for any service in the monorepo.

## How It Works

`settings.py` instantiates `Settings()` at module level, and `database.py` creates `async_engine` at module level. This means environment variables are baked in the moment you import `from src.main import app`. The root `tests/conftest.py` sets fake env vars (SQLite, S3, etc.) before any imports, which is what makes unit tests work without real services.

The problem: those fake env vars also poison integration tests. The `.env` file (with real MinIO/PostgreSQL config) gets ignored because `os.environ` takes precedence over Pydantic's `env_file`.

The solution: a single `INTEGRATION_TEST` guard. When set, the root conftest skips injecting fake env vars, so Pydantic Settings reads from `.env` and connects to real services.

## Step-by-Step Setup

### 1. Guard the root `tests/conftest.py`

Wrap the fake env var block so it only runs for unit tests:

```python
import os

if not os.environ.get("INTEGRATION_TEST"):
    _TEST_ENV_VARS = {
        "DB_HOST": "localhost",
        "DB_NAME": "test_db",
        # ... all your fake values
    }
    for key, value in _TEST_ENV_VARS.items():
        os.environ.setdefault(key, value)
```

### 2. Configure `pyproject.toml`

Add the integration marker, exclude integration tests from default runs, and set session-scoped event loops:

```toml
[tool.pytest.ini_options]
markers = [
    "integration: mark a test as an integration test (uses real external services)"
]
addopts = "-m 'not integration'"
asyncio_mode = "auto"
asyncio_default_test_loop_scope = "session"
asyncio_default_fixture_loop_scope = "session"
```

The session-scoped event loop is critical. Your app's internal connections (asyncpg pool, aioboto3 sessions) are bound to the event loop they were created on. If tests ran on separate function-scoped loops, they'd hit `RuntimeError: Event loop is closed` or `Future attached to a different loop`.

### 3. Create `tests/integration/conftest.py`

Three fixtures do all the work:

```python
import socket

import pytest
import pytest_asyncio
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from src.config.settings import settings
from src.main import app


@pytest.fixture(scope="session", autouse=True)
def _check_services():
    """Health-check services. Fail fast with actionable error."""
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

    # Adapt this block to your storage provider's health endpoint
    try:
        import urllib.request
        urllib.request.urlopen(
            f"{settings.S3_ENDPOINT_URL}/minio/health/live", timeout=2
        )
    except Exception:
        errors.append(f"  - MinIO not reachable at {settings.S3_ENDPOINT_URL}")

    if errors:
        pytest.fail(
            "Required services are not running:\n"
            + "\n".join(errors)
            + "\n\nStart them with: docker compose up -d"
        )


@pytest.fixture(autouse=True)
async def db_schema():
    """Shadows root conftest's autouse db_schema fixture.
    Prevents SQLite CREATE/DROP from running. Real schema is
    managed by Alembic migrations in the app lifespan."""
    yield


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def integration_client():
    """Real app with full lifespan — migrations, storage init, workers."""
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            yield client
```

Key points:
- **`_check_services`** is sync and session-scoped — runs once, avoids async session-scope issues.
- **`db_schema`** shadows the root conftest's autouse fixture by name — this is what prevents the in-memory SQLite setup/teardown.
- **`integration_client`** uses `pytest_asyncio.fixture` with `loop_scope="session"` — the app boots once, all tests share it.
- **Zero dependency overrides** — `get_db_session`, storage providers, etc. all use real implementations from `.env`.

### 4. Write tests

```python
@pytest.mark.integration
async def test_something(integration_client):
    resp = await integration_client.get("/healthz")
    assert resp.status_code == 200
```

Every test must use randomized identifiers (UUIDs for project IDs, filenames, etc.) and clean up its own data in teardown. Tests isolate via unique names, not DB rollbacks.

### 5. Run

```bash
# Start services from the repo root
docker compose up -d postgresql minio minio-init temporal

# From your service directory
INTEGRATION_TEST=1 pytest -m integration -v   # integration tests
pytest -v                                      # unit tests (unchanged)
```
