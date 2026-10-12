"""Tests for Qdrant Temporal activities (non-LLM, I/O wrappers)."""

from collections.abc import Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.activities.qdrant_activities import (
    delete_document_from_qdrant,
    fetch_and_prepare_chunks,
    get_claim_ids,
    init_qdrant_collection,
    upload_claims_to_qdrant,
)
from src.qdrant.schemas import (
    ClaimEvidence,
    ClaimMetadata,
    ClaimPayload,
)
from src.workflows.qdrant_wf.schemas.workflow import (
    DocumentActivityInput,
    UploadClaimsInput,
)

from .conftest import make_chunk_payload


@pytest.fixture
def mock_qdrant() -> Generator[MagicMock]:
    with patch("src.activities.qdrant_activities.qdrant_client") as mock:
        yield mock


class TestSimpleWrappers:
    @pytest.mark.asyncio
    async def test_init_qdrant_collection_delegates(self, mock_qdrant: MagicMock) -> None:
        mock_qdrant.init_claim_collection = AsyncMock()
        await init_qdrant_collection()
        mock_qdrant.init_claim_collection.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_delete_document_from_qdrant_delegates(self, mock_qdrant: MagicMock) -> None:
        mock_qdrant.clear_document_claims = AsyncMock()
        await delete_document_from_qdrant(DocumentActivityInput(project_id="p", document_id="d"))
        mock_qdrant.clear_document_claims.assert_awaited_once_with(project_id="p", document_id="d")

    @pytest.mark.asyncio
    async def test_get_claim_ids_delegates(self, mock_qdrant: MagicMock) -> None:
        mock_qdrant.get_claim_ids = AsyncMock(return_value=["a", "b"])
        result = await get_claim_ids(DocumentActivityInput(project_id="p", document_id="d"))
        assert result == ["a", "b"]
        mock_qdrant.get_claim_ids.assert_awaited_once_with("d", "p")


class TestFetchAndPrepareChunks:
    @pytest.mark.asyncio
    async def test_filters_short_and_image_chunks(self, mock_qdrant: MagicMock) -> None:
        chunks = [
            make_chunk_payload(chunk_id="ok", chunk_content="x" * 1000),
            make_chunk_payload(chunk_id="short", chunk_content="x"),
            make_chunk_payload(chunk_id="image", chunk_content="x" * 1000, chunk_type="image"),
        ]
        mock_qdrant.get_chunk_ids_by_document_id = AsyncMock(return_value=["ok", "short", "image"])
        mock_qdrant.get_chunk_payloads = AsyncMock(return_value=chunks)

        result = await fetch_and_prepare_chunks(DocumentActivityInput(project_id="p", document_id="d"))

        kept_ids = {c.chunk_id for c in result}
        assert kept_ids == {"ok"}


class TestUploadClaimsToQdrant:
    def _claim(self, claim_id: str = "claim-1", vector: list[float] | None = None) -> ClaimPayload:
        return ClaimPayload(
            project_id="p",
            document_id="d",
            title="t",
            chunk_id="c1",
            claim_metadata=ClaimMetadata(
                claim_id=claim_id,
                claim_content="text",
                evidence=ClaimEvidence(claim_quotes=["q"]),
            ),
            vector=vector if vector is not None else [0.1] * 4,
        )

    @pytest.mark.asyncio
    async def test_empty_claims_is_noop(self, mock_qdrant: MagicMock) -> None:
        mock_qdrant.upsert = AsyncMock()
        await upload_claims_to_qdrant(UploadClaimsInput(claims=[]))
        mock_qdrant.upsert.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_raises_when_any_vector_is_none(self, mock_qdrant: MagicMock) -> None:
        no_vector_claim = ClaimPayload(
            project_id="p",
            document_id="d",
            title="t",
            chunk_id="c1",
            claim_metadata=ClaimMetadata(
                claim_id="c1",
                claim_content="text",
                evidence=ClaimEvidence(claim_quotes=["q"]),
            ),
            vector=None,
        )
        with pytest.raises(ValueError, match="non-None vector"):
            await upload_claims_to_qdrant(UploadClaimsInput(claims=[no_vector_claim]))

    @pytest.mark.asyncio
    async def test_upserts_each_claim_with_expected_payload(self, mock_qdrant: MagicMock) -> None:
        mock_qdrant.upsert = AsyncMock()
        claims = [self._claim(claim_id=f"c{i}") for i in range(3)]
        await upload_claims_to_qdrant(UploadClaimsInput(claims=claims))
        # At least one upsert call happened with the configured batch size.
        assert mock_qdrant.upsert.await_count >= 1
        upsert_call = mock_qdrant.upsert.await_args
        assert upsert_call is not None
        kwargs = upsert_call.kwargs
        assert kwargs["wait"] is True
        assert "collection_name" in kwargs
