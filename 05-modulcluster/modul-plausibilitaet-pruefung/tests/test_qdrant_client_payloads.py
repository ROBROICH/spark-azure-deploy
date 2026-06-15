"""Qdrant client tests for payload parsing, retrieve wrappers, and scrolling."""

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest
from qdrant_client import models

from src.qdrant.client import PlausibilityQdrantClient
from src.qdrant.schemas import ChunkPayload, ClaimPayload


def _bare_client() -> PlausibilityQdrantClient:
    return object.__new__(PlausibilityQdrantClient)


def _claim_record(record_id: str = "c1") -> SimpleNamespace:
    return SimpleNamespace(
        id=record_id,
        payload={
            "project_id": "p", "document_id": "d", "title": "t",
            "chunk_id": "k1",
            "claim_metadata": {
                "claim_id": record_id, "claim_content": "x",
                "evidence": {"claim_quotes": ["q"]},
            },
        },
        vector=None,
    )


def _chunk_record(record_id: str = "k1") -> SimpleNamespace:
    return SimpleNamespace(
        id=record_id,
        payload={
            "project_id": "p", "document_id": "d", "title": "t",
            "chunk_content": "x", "chunk_id": record_id,
            "page_numbers": [1], "chunk_type": "text",
            "toc_path": ["S"], "focus_topic": "t",
        },
        vector=None,
    )


class TestParsePayloadRecords:
    def test_claim_payload_with_vectors(self) -> None:
        client = _bare_client()
        record = _claim_record("c1")
        record.vector = [0.5] * 4

        parsed = client._parse_payload_records(
            records=[record], model_cls=ClaimPayload,
            with_vectors=True, payload_name="Claim",
        )

        assert parsed[0].vector == [0.5] * 4

    def test_records_without_payload_are_skipped(self) -> None:
        client = _bare_client()
        parsed = client._parse_payload_records(
            records=[SimpleNamespace(id="bad", payload=None, vector=None)],
            model_cls=ChunkPayload,
            with_vectors=False,
            payload_name="Chunk",
        )

        assert parsed == []

    def test_chunk_payload_uses_source_file_id_as_document_id(self) -> None:
        client = _bare_client()
        record = _chunk_record("chunk-1")
        record.payload["document_id"] = "extraction-json-id"
        record.payload["source_file_id"] = "raw-pdf-id"

        parsed = client._parse_payload_records(
            records=[record], model_cls=ChunkPayload,
            with_vectors=False, payload_name="Chunk",
        )

        assert parsed[0].document_id == "raw-pdf-id"


class TestGetChunkPayloads:
    @pytest.mark.asyncio
    async def test_empty_input_short_circuits(self) -> None:
        client = _bare_client()
        result = await client.get_chunk_payloads(project_id="p", chunk_ids=[])
        assert result == []


class TestGetClaimPayloads:
    @pytest.mark.asyncio
    async def test_empty_input_short_circuits(self) -> None:
        client = _bare_client()
        result = await client.get_claim_payloads(project_id="p", claim_ids=[])
        assert result == []

class TestGetRecordPayloads:
    @pytest.mark.asyncio
    async def test_retrieve_dedupes_unique_ids(self) -> None:
        client = _bare_client()
        captured_ids: list[list[str]] = []

        async def fake_retrieve(**kwargs: Any) -> list[Any]:
            captured_ids.append(kwargs["ids"])
            return []

        client.retrieve = AsyncMock(side_effect=fake_retrieve)  # type: ignore[method-assign]
        await client._get_record_payloads(
            project_id="p", point_ids=["a", "a", "b"], collection="claims",
        )

        assert sorted(captured_ids[0]) == ["a", "b"]


class TestGetRecordIds:
    @pytest.mark.asyncio
    async def test_scroll_pagination_dedupes(self) -> None:
        client = _bare_client()
        responses = iter([
            ([SimpleNamespace(id="a"), SimpleNamespace(id="b")], "cursor-1"),
            ([SimpleNamespace(id="b"), SimpleNamespace(id="c")], None),
        ])

        async def fake_scroll(**kwargs: Any) -> tuple[list[Any], str | None]:
            return next(responses)

        client.scroll = AsyncMock(side_effect=fake_scroll)  # type: ignore[method-assign]
        result = await client._get_record_ids(
            collection_name="x",
            collection_filter=models.Filter(must=[]),
        )

        assert result == ["a", "b", "c"]


class TestGetChunkIdsByDocumentId:
    @pytest.mark.asyncio
    async def test_returns_unique_payload_chunk_ids(self) -> None:
        client = _bare_client()
        responses = iter([
            (
                [
                    SimpleNamespace(id="r1", payload={"chunk_id": "k1"}),
                    SimpleNamespace(id="r2", payload={"chunk_id": "k1"}),
                    SimpleNamespace(id="r3", payload={"chunk_id": "k2"}),
                ],
                None,
            ),
        ])

        async def fake_scroll(**kwargs: Any) -> tuple[list[Any], str | None]:
            return next(responses)

        client.scroll = AsyncMock(side_effect=fake_scroll)  # type: ignore[method-assign]
        result = await client.get_chunk_ids_by_document_id(project_id="p", document_id="d")

        assert result == ["k1", "k2"]


class TestScrollByPayloadField:
    @pytest.mark.asyncio
    async def test_collects_all_pages(self) -> None:
        client = _bare_client()
        responses = iter([
            ([SimpleNamespace(id="r1"), SimpleNamespace(id="r2")], "cursor"),
            ([SimpleNamespace(id="r3")], None),
        ])

        async def fake_scroll(**kwargs: Any) -> tuple[list[Any], str | None]:
            return next(responses)

        client.scroll = AsyncMock(side_effect=fake_scroll)  # type: ignore[method-assign]
        result = await client._scroll_by_payload_field(
            project_id="p", payload_field="chunk_id", values=["k1"],
            collection="chunks", with_vectors=False,
        )

        assert [r.id for r in result] == ["r1", "r2", "r3"]

    @pytest.mark.asyncio
    async def test_empty_field_values_returns_empty(self) -> None:
        client = _bare_client()
        result = await client._get_record_payloads_by_payload_field(
            project_id="p", payload_field="chunk_id", field_values=[],
            collection="chunks",
        )

        assert result == []

    @pytest.mark.asyncio
    async def test_batches_large_value_lists(self) -> None:
        client = _bare_client()
        call_args: list[list[str]] = []

        async def fake_scroll_batch(
            *, project_id: str, payload_field: str, values: list[str],
            collection: str, with_vectors: bool,
        ) -> list[Any]:
            call_args.append(values)
            return [SimpleNamespace(id=v) for v in values]

        client._scroll_by_payload_field = AsyncMock(side_effect=fake_scroll_batch)  # type: ignore[method-assign]
        values = [f"v{i}" for i in range(client._MATCH_ANY_BATCH_SIZE + 5)]

        result = await client._get_record_payloads_by_payload_field(
            project_id="p", payload_field="chunk_id", field_values=values,
            collection="chunks",
        )

        assert len(result) == len(values)
        assert len(call_args) >= 2
