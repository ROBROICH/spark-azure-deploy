"""Shared test configuration and fixtures for modul-bewertung."""

import os
from collections.abc import Callable

import pytest

# ---------------------------------------------------------------------------
# Environment setup: required because src/env.py validates Settings() at import
# time. Without these, any `from src.workflows...` import would fail.
# Set SKIP_DOTENV to prevent loading .env.local files.
# ---------------------------------------------------------------------------
os.environ.setdefault("SKIP_DOTENV", "true")
os.environ.setdefault("LITELLM_MODEL", "openai/gpt-oss-120b")
os.environ.setdefault("TEMPORAL_HOST", "localhost:7233")
os.environ.setdefault("TEMPORAL_S3_BUCKET_NAME", "test-bucket")
os.environ.setdefault("TEMPORAL_S3_ENDPOINT_URL", "http://localhost:9000")
os.environ.setdefault("TEMPORAL_S3_ACCESS_KEY_ID", "test")
os.environ.setdefault("TEMPORAL_S3_SECRET_ACCESS_KEY", "test")
os.environ.setdefault("TEMPORAL_S3_REGION", "eu-west-1")
os.environ.setdefault("TEMPORAL_JOB_SERVICE_URL", "http://localhost:18011")
os.environ.setdefault("OTEL_SERVICE_NAME", "bewertung-test")
os.environ.setdefault("OTEL_ENDPOINT", "http://localhost:4317")

from temporal.contracts import Originaltext

from src.models.types import MicroSummary

# ---------------------------------------------------------------------------
# Shared fixtures: reusable test data builders
# ---------------------------------------------------------------------------


@pytest.fixture
def micro_factory() -> Callable[..., MicroSummary]:
    """Factory for creating MicroSummary instances."""

    def _micro(svm_id: str, kernaussage: str = "Kernaussage") -> MicroSummary:
        return MicroSummary(svm_id=svm_id, kernaussage=f"{kernaussage} {svm_id}")

    return _micro


@pytest.fixture
def micros_factory(micro_factory: Callable[..., MicroSummary]) -> Callable[[int], list[MicroSummary]]:
    """Factory for creating lists of MicroSummary instances."""

    def _micros(n: int) -> list[MicroSummary]:
        return [micro_factory(f"{i:04d}") for i in range(1, n + 1)]

    return _micros


@pytest.fixture
def ot_factory() -> Callable[..., Originaltext]:
    """Factory for creating Originaltext instances."""

    def _ot(node_id: str, title: str = "Title", text: str = "Text") -> Originaltext:
        return Originaltext(
            document_id="doc-001",
            node_id=node_id,
            title=title,
            text=text,
            chunk_ids=[f"chunk-{node_id}"],
            page_numbers=[1],
        )

    return _ot
