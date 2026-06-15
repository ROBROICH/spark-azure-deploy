"""Qdrant client tests for collection creation and deletion operations."""

from unittest.mock import AsyncMock

import pytest

from src.config.config import Config
from src.qdrant.client import PlausibilityQdrantClient


def _bare_client() -> PlausibilityQdrantClient:
    return object.__new__(PlausibilityQdrantClient)


class TestInitClaimCollection:
    @pytest.mark.asyncio
    async def test_skips_creation_when_collection_exists(self) -> None:
        client = _bare_client()
        client.collection_exists = AsyncMock(return_value=True)  # type: ignore[method-assign]
        create_mock = AsyncMock()
        client.create_collection = create_mock  # type: ignore[method-assign]

        await client.init_claim_collection()

        create_mock.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_creates_collection_and_indexes(self) -> None:
        client = _bare_client()
        client.collection_exists = AsyncMock(return_value=False)  # type: ignore[method-assign]
        client.create_collection = AsyncMock()  # type: ignore[method-assign]
        client.create_payload_index = AsyncMock()  # type: ignore[method-assign]

        await client.init_claim_collection()

        total_indexes = (
            len(Config.QDRANT.INDEX_KEYWORDS)
            + len(Config.QDRANT.INDEX_TEXT)
            + len(Config.QDRANT.INDEX_BOOLS)
        )
        client.create_collection.assert_awaited_once()
        assert client.create_payload_index.await_count == total_indexes


class TestClearDocumentClaims:
    @pytest.mark.asyncio
    async def test_skips_when_collection_missing(self) -> None:
        client = _bare_client()
        client.collection_exists = AsyncMock(return_value=False)  # type: ignore[method-assign]
        client.delete = AsyncMock()  # type: ignore[method-assign]

        await client.clear_document_claims(project_id="p", document_id="d")

        client.delete.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_deletes_with_filter(self) -> None:
        client = _bare_client()
        client.collection_exists = AsyncMock(return_value=True)  # type: ignore[method-assign]
        client.delete = AsyncMock()  # type: ignore[method-assign]

        await client.clear_document_claims(project_id="p", document_id="d")

        client.delete.assert_awaited_once()
