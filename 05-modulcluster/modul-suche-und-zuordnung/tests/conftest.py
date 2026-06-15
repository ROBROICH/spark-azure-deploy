"""
Pytest configuration for modul-suche-und-zuordnung.

Sets all required environment variables before any test module is imported,
so that ENV = Settings() in src/env.py succeeds without real credentials.
SKIP_DOTENV prevents pydantic-settings from trying to load .env files that
do not exist in CI.
"""

import os

os.environ.setdefault("SKIP_DOTENV", "true")

os.environ.setdefault("TEMPORAL_HOST", "localhost:7233")
os.environ.setdefault("TEMPORAL_S3_BUCKET_NAME", "temporal-payloads")
os.environ.setdefault("TEMPORAL_S3_ENDPOINT_URL", "http://localhost:9000")
os.environ.setdefault("TEMPORAL_S3_ACCESS_KEY_ID", "minioadmin")
os.environ.setdefault("TEMPORAL_S3_SECRET_ACCESS_KEY", "minioadmin")
os.environ.setdefault("TEMPORAL_S3_REGION", "eu-west-1")

os.environ.setdefault("DMS_BASE_URL", "http://localhost:8888")
os.environ.setdefault("DMS_TIMEOUT", "30")
os.environ.setdefault("DMS_FVP_URL", "http://localhost:8001")

os.environ.setdefault("QDRANT_HOST", "localhost")
os.environ.setdefault("QDRANT_PORT", "6333")
os.environ.setdefault("QDRANT_COLLECTION", "test-collection")

os.environ.setdefault("LITELLM_BASE_URL", "http://localhost:11434/v1")
os.environ.setdefault("LITELLM_MASTER_KEY", "test")

os.environ.setdefault("OTEL_SERVICE_NAME", "modul-suche-und-zuordnung")
os.environ.setdefault("OTEL_ENDPOINT", "http://localhost:4317")

os.environ.setdefault("LAW_DATABASE_DKE_BASE_URL", "http://localhost:15432")
os.environ.setdefault("LAW_DATABASE_UT_BASE_URL", "http://localhost:5555")

os.environ.setdefault("LLM_EMBEDDING_MODEL", "self-hosted/bge-m3")
os.environ.setdefault("LLM_PAGEINDEX_SVM_MODEL_STAGE1", "self-hosted/gpt-oss-120b")
os.environ.setdefault("LLM_PAGEINDEX_SVM_MODEL_STAGE2", "self-hosted/gpt-oss-120b")
os.environ.setdefault("LLM_DB_RESEARCH_MODEL", "self-hosted/gpt-oss-120b")
os.environ.setdefault("TEMPORAL_JOB_SERVICE_URL", "http://localhost:18011")
