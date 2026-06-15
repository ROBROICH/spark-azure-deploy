"""Test configuration and fixtures."""

import os

# Set env vars BEFORE any src imports — settings.py and database.py execute at module level.
# All `*_DB_*` fields are required, so we provide dummy values per source. The engines
# are created (asyncpg lazy-connects), but no real connection is opened during unit tests.
_TEST_ENV_VARS = {
    "SERVICE_NAME": "protocol-service-test",
    "AUTH_MODE": "disabled",
}
for _prefix in (
    "PROJECT_LOGIC",
    "FORMAL_COMPLETENESS",
    "COMMENT",
    "SUPPLEMENTARY",
    "PLAUSIBILITY",
    "DOCUMENT_MANAGEMENT",
    "ADMINISTRATIVE_DRAFT",
    "EXAMINATION",
    "OBJECTIONS_MANAGEMENT",
):
    _TEST_ENV_VARS[f"{_prefix}_DB_USER"] = "test"
    _TEST_ENV_VARS[f"{_prefix}_DB_PASSWORD"] = "test"
    _TEST_ENV_VARS[f"{_prefix}_DB_HOST"] = "localhost"
    _TEST_ENV_VARS[f"{_prefix}_DB_PORT"] = "5432"
    _TEST_ENV_VARS[f"{_prefix}_DB_NAME"] = f"{_prefix.lower()}_test_db"
for key, value in _TEST_ENV_VARS.items():
    os.environ.setdefault(key, value)

from collections.abc import Generator  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from src.main import app  # noqa: E402


@pytest.fixture
def client() -> Generator[TestClient]:
    with TestClient(app) as c:
        yield c
