import os
from collections.abc import AsyncGenerator, Generator
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

# Minimum required env vars must be set before importing ``src`` modules, because
# ``src.config.settings`` instantiates a pydantic ``Settings`` object at import time
# and ``src.db.database`` builds the engine from it. The src imports below are
# therefore intentionally not at the top of the file (E402).
NO_TESTS_COLLECTED_EXIT_CODE = 5

os.environ.setdefault("DB_HOST", "localhost")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("DB_USER", "postgres")
os.environ.setdefault("DB_PASSWORD", "postgres")
os.environ.setdefault("PROJECT_LOGIC_SERVICE_URL", "http://localhost:8001")

from src.db.database import get_db_session  # noqa: E402  (see env-setup note above)
from src.main import app  # noqa: E402  (see env-setup note above)


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    """Treat 'no tests selected' (exit code 5) as success for CI.

    All integration tests are deselected by default via ``-m 'not integration'``.
    When no unit tests exist yet, pytest would otherwise fail the build.
    """
    if exitstatus == NO_TESTS_COLLECTED_EXIT_CODE:
        session.exitstatus = 0


async def override_get_db() -> AsyncGenerator[AsyncMock]:
    yield AsyncMock()


@pytest.fixture
def client() -> Generator[TestClient]:
    app.dependency_overrides[get_db_session] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def mock_db_session() -> AsyncMock:
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.delete = AsyncMock()
    session.execute = AsyncMock()
    session.get = AsyncMock()
    return session


@pytest.fixture
def sample_gesetz_payload() -> dict[str, Any]:
    return {
        "name": "Bundesnaturschutzgesetz",
        "jurabk": "BNatSchG",
    }


@pytest.fixture
def sample_norm_payload() -> dict[str, Any]:
    return {
        "paragraph_nr": "44",
        "text": "Artenschutz paragraph text",
        "regelungsgegenstand": "Artenschutz",
    }


@pytest.fixture
def sample_dokument_payload() -> dict[str, Any]:
    return {
        "filename": "Antrag_Windpark_Nord.pdf",
        "mime_type": "application/pdf",
        "page_count": 127,
    }


@pytest.fixture
def sample_fundstelle_payload() -> dict[str, Any]:
    return {
        "text": "Found relevant section...",
        "page_number": 42,
        "relevanz_score": 0.87,
    }


@pytest.fixture
def sample_bewertung_tbm_payload() -> dict[str, Any]:
    return {
        "result": "unclear",
        "reasoning": "More evidence needed...",
    }
