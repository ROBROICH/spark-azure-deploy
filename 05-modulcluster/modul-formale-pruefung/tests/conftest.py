import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Set test environment variables BEFORE any src imports happen.
# This is required because src/config/env.py instantiates Settings() at module level.
_TEST_ENV_VARS = {
    "LITELLM_BASE_URL": "http://localhost:4000/v1",
    "LITELLM_MASTER_KEY": "test-key",
    "LITELLM_MODEL": "mistral-small-2506",
    "DMS_BASE_URL": "http://localhost:8000",
    "OTEL_SERVICE_NAME": "formale-pruefung-test",
    "OTEL_ENDPOINT": "http://localhost:4317",
    "TEMPORAL_HOST": "localhost:7233",
    "TEMPORAL_LLM_MAX_PER_SECOND": "3",
    "TEMPORAL_S3_BUCKET_NAME": "test-bucket",
    "TEMPORAL_S3_ENDPOINT_URL": "http://localhost:9000",
    "TEMPORAL_S3_ACCESS_KEY_ID": "minioadmin",
    "TEMPORAL_S3_SECRET_ACCESS_KEY": "minioadmin",
    "TEMPORAL_S3_REGION": "eu-west-1",
    "TEMPORAL_JOB_SERVICE_URL": "http://localhost:18011",
}
for key, value in _TEST_ENV_VARS.items():
    os.environ.setdefault(key, value)
