"""Shared test configuration and fixtures for the plausibility module."""

import os
from collections.abc import Callable
from typing import Any

# Env vars must be set before any src imports trigger Settings() validation
os.environ.setdefault("LITELLM_MODEL", "self-hosted/gpt-oss-120b")
os.environ.setdefault("LITELLM_EMBEDDING_MODEL", "self-hosted/bge-m3")
os.environ.setdefault("QDRANT_CLUSTER_ENDPOINT", "http://localhost:6333")
os.environ.setdefault("DMS_BASE_URL", "http://localhost:8000")
os.environ.setdefault("TEMPORAL_HOST", "localhost:7233")
os.environ.setdefault("TEMPORAL_S3_BUCKET_NAME", "test-bucket")
os.environ.setdefault("TEMPORAL_S3_ENDPOINT_URL", "http://localhost:9000")
os.environ.setdefault("TEMPORAL_S3_ACCESS_KEY_ID", "test-access-key")
os.environ.setdefault("TEMPORAL_S3_SECRET_ACCESS_KEY", "test-secret-key")
os.environ.setdefault("TEMPORAL_S3_REGION", "eu-west-1")
os.environ.setdefault("OTEL_SERVICE_NAME", "test-plausibility")
os.environ.setdefault("OTEL_ENDPOINT", "http://localhost:4317")

import httpx
import pytest

from src.qdrant.schemas import (
    ChunkPayload,
    ClaimEvidence,
    ClaimMetadata,
    ClaimPayload,
)
from src.workflows.check_logic_wf.schemas.clustering_schemas import (
    InconsistencyPair,
)
from src.workflows.check_logic_wf.schemas.context_checker_schemas import (
    ChunkWithContext,
)

TransportHandler = Callable[[httpx.Request], httpx.Response]
TransportInstaller = Callable[[TransportHandler], None]


@pytest.fixture
def install_transport(monkeypatch: pytest.MonkeyPatch) -> TransportInstaller:
    """Replace DMS httpx clients with a MockTransport-backed client."""

    def _install(handler: TransportHandler) -> None:
        transport = httpx.MockTransport(handler)
        original = httpx.AsyncClient

        def _factory(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
            kwargs.pop("limits", None)
            return original(*args, transport=transport, **kwargs)

        monkeypatch.setattr("temporal.dms_client.httpx.AsyncClient", _factory)

    return _install


def make_claim_payload(
    claim_id: str = "claim-1",
    project_id: str = "proj-1",
    document_id: str = "doc-1",
    chunk_id: str = "chunk-1",
    claim_text: str = "Test claim text",
    erlauterungsbericht: bool = False,
    vector: list[float] | None = None,
) -> ClaimPayload:
    """Factory for ClaimPayload test instances."""
    return ClaimPayload(
        project_id=project_id,
        document_id=document_id,
        title="Test Document",
        chunk_id=chunk_id,
        erlauterungsbericht=erlauterungsbericht,
        claim_metadata=ClaimMetadata(
            claim_id=claim_id,
            claim_content=claim_text,
            evidence=ClaimEvidence(claim_quotes=["quote"]),
        ),
        vector=vector,
    )


def make_chunk_payload(
    chunk_id: str = "chunk-1",
    project_id: str = "proj-1",
    document_id: str = "doc-1",
    chunk_content: str = "Some chunk content for testing.",
    chunk_type: str = "text",
    page_numbers: list[int] | None = None,
    toc_path: list[str] | None = None,
    previous_chunk_id: str | None = None,
    next_chunk_id: str | None = None,
    summary: str | None = None,
) -> ChunkPayload:
    """Factory for ChunkPayload test instances."""
    return ChunkPayload(
        project_id=project_id,
        document_id=document_id,
        title="Test Document",
        chunk_content=chunk_content,
        chunk_id=chunk_id,
        previous_chunk_id=previous_chunk_id,
        next_chunk_id=next_chunk_id,
        page_numbers=page_numbers or [1],
        chunk_type=chunk_type,
        toc_path=toc_path or ["Section 1"],
        focus_topic="test",
        summary=summary,
    )


def make_chunk_with_context(
    document_id: str = "doc-1",
    chunk_text: str = "Base chunk text",
    preceding_text: str = "Preceding context",
    following_text: str = "Following context",
    page_numbers: list[int] | None = None,
    document_name: str | None = "Test Doc",
    toc_path: list[str] | None = None,
) -> ChunkWithContext:
    """Factory for ChunkWithContext test instances."""
    return ChunkWithContext(
        document_id=document_id,
        chunk_text=chunk_text,
        preceding_text=preceding_text,
        following_text=following_text,
        page_numbers=page_numbers or [1],
        document_name=document_name,
        toc_path=toc_path or ["Section 1"],
    )


def make_inconsistency_pair(
    chunk_a_id: str = "chunk-a",
    chunk_b_id: str = "chunk-b",
    chunk_a_document_id: str = "doc-a",
    chunk_b_document_id: str = "doc-b",
    claim_a_id: str = "claim-a",
    claim_b_id: str = "claim-b",
    rating: int = 75,
    title: str = "Test contradiction",
    explanation: str = "Test explanation for the contradiction.",
) -> InconsistencyPair:
    """Factory for InconsistencyPair test instances."""
    return InconsistencyPair(
        chunk_a_id=chunk_a_id,
        chunk_b_id=chunk_b_id,
        chunk_a_document_id=chunk_a_document_id,
        chunk_b_document_id=chunk_b_document_id,
        claim_a_id=claim_a_id,
        claim_b_id=claim_b_id,
        content_a_excerpt="Excerpt from chunk A",
        content_b_excerpt="Excerpt from chunk B",
        chunk_a_document_name="Doc A",
        chunk_b_document_name="Doc B",
        chunk_a_page_number=1,
        chunk_b_page_number=2,
        rating=rating,
        title=title,
        explanation=explanation,
    )
