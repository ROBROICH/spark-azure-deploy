"""Shared test configuration for llm-client tests.

Environment variables are set at module level so they are available
*before* any llm_client module is imported.  The module-level
``ENV = WorkerSettings()`` in ``llm_client.env`` fires on first import,
so the env vars must already be present by that time.
"""

from __future__ import annotations

import os
from collections.abc import Generator
from unittest.mock import MagicMock, patch

import pytest

# Populate all required WorkerSettings fields with dummy values.
# These must be set before any import of llm_client.* triggers
# pydantic-settings validation.
_TEST_ENV_VARS: dict[str, str] = {
    "ENV": "dev",
    "LITELLM_BASE_URL": "http://localhost:4000/v1",
    "LITELLM_MASTER_KEY": "sk-test-dummy-key",
    "TEMPORAL_HOST": "localhost:7233",
    "TEMPORAL_S3_BUCKET_NAME": "temporal-payloads",
    "TEMPORAL_S3_ENDPOINT_URL": "http://localhost:9000",
    "TEMPORAL_S3_ACCESS_KEY_ID": "minioadmin",
    "TEMPORAL_S3_SECRET_ACCESS_KEY": "minioadmin",
    "TEMPORAL_S3_REGION": "eu-west-1",
    "OTEL_SERVICE_NAME": "llm-client-test",
    "OTEL_ENDPOINT": "http://localhost:4317",
    "SKIP_DOTENV": "1",
}

for _key, _value in _TEST_ENV_VARS.items():
    os.environ.setdefault(_key, _value)


@pytest.fixture(autouse=True)
def _mock_activity_info() -> Generator[MagicMock, None, None]:
    """Provide a fake activity context so activity.info() works outside Temporal."""
    mock_info = MagicMock()
    mock_info.attempt = 1
    with patch("temporalio.activity.info", return_value=mock_info):
        yield mock_info
