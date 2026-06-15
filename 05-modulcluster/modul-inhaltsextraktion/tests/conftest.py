"""Shared test fixtures and environment setup for the test suite."""

import os
import sys
from pathlib import Path

# Set test environment variables BEFORE any src imports happen.
# This is required because src/env.py instantiates Settings() at module level.
_TEST_ENV_VARS = {
    "LITELLM_BASE_URL": "http://mock-litellm:4000/v1",
    "LITELLM_MASTER_KEY": "sk-mock-key",
    "DMS_BASE_URL": "http://mock-dms:8000",
    "VLLM_MODEL": "mistral-small-2506",
    "METADATA_MODEL_NAME": "self-hosted/gpt-oss-120b",
    "SCHWERPUNKTTHEMA_MODEL_NAME": "self-hosted/gpt-oss-120b",
    "SUMMARIZATION_MODEL_NAME": "self-hosted/gpt-oss-120b",
    "VLM_SUMMARY_MODEL_NAME": "self-hosted/gpt-oss-120b",
    "STRUCTURE_MODEL_NAME": "self-hosted/gpt-oss-120b",
    "OTEL_SERVICE_NAME": "mock-service",
    "OTEL_ENDPOINT": "http://mock-otel:4317",
    "TEMPORAL_SERVER_URL": "http://mock-temporal:7233",
    "TEMPORAL_S3_BUCKET_NAME": "mock-bucket",
    "TEMPORAL_S3_ENDPOINT_URL": "http://mock-s3:9000",
    "TEMPORAL_S3_ACCESS_KEY_ID": "FAKE_access_key_for_tests",
    "TEMPORAL_S3_SECRET_ACCESS_KEY": "FAKE_secret_key_for_tests",
    "TEMPORAL_S3_REGION": "mock-region",
    "UNO_HOST": "mock-uno-host",
    "UNO_PORT": "2003",
    "UNO_PROTOCOL": "http",
    "SINGLE_DOCUMENT_WORKFLOW_CONCURRENCY": "1",
    "SINGLE_DOCUMENT_EWMS_WORKFLOW_CONCURRENCY": "1",
    "EXTRACTION_PROVIDER": "docling",
    "DOCLING_HOST": "mock-docling-host",
    "DOCLING_PORT": "5001",
    "QDRANT_BASE_URL": "http://mock-qdrant:6333",
    "QDRANT_DENSE_VECTOR_SIZE": "1024",
    "EMBEDDING_MODEL": "baai/bge-m3",
    "INJECTION_LLM_MODEL": "mock-model",
    "INJECTION_MODEL_URL": "http://mock-prompt-injection:7777",
    "INJECTION_MODEL_TOKEN": "FAKE_token",
    "TEMPORAL_JOB_SERVICE_URL": "http://localhost:18011",

}
for key, value in _TEST_ENV_VARS.items():
    os.environ.setdefault(key, value)

# This line is critical: It ensures that the tests can find the 'src' module
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Patch temporalio.workflow.uuid4 BEFORE any src imports happen
# This is required because src/schemas.py uses workflow.uuid4 as default_factory
# and Pydantic stores the reference at class definition time
import uuid  # noqa: E402
from unittest.mock import patch  # noqa: E402

_workflow_uuid4_patcher = patch("temporalio.workflow.uuid4", side_effect=lambda: uuid.uuid4())
_workflow_uuid4_patcher.start()

from unittest.mock import MagicMock  # noqa: E402

import pytest  # noqa: E402
