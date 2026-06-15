import os
import pytest

os.environ.setdefault("OTEL_SERVICE_NAME", "jura-db-worker")
os.environ.setdefault("OTEL_ENDPOINT", "http://localhost:4317")
os.environ.setdefault("TEMPORAL_JOB_SERVICE_URL", "http://localhost:18015")
os.environ.setdefault("TEMPORAL_HOST", "localhost:7233")
os.environ.setdefault("TEMPORAL_S3_BUCKET_NAME", "temporal-payloads")
os.environ.setdefault("TEMPORAL_S3_ENDPOINT_URL", "http://localhost:9000")
os.environ.setdefault("TEMPORAL_S3_ACCESS_KEY_ID", "test-key")
os.environ.setdefault("TEMPORAL_S3_SECRET_ACCESS_KEY", "test")
os.environ.setdefault("TEMPORAL_S3_REGION", "eu-west-1")
os.environ.setdefault("AUTH_MODE", "disabled")
