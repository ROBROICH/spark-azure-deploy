"""Tests for the build_chunk_contexts_batch activity."""

from collections.abc import Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.activities.context_checker import build_chunk_contexts_batch
from src.config.config import config
from src.qdrant.schemas import ChunkPayload
from src.workflows.check_logic_wf.schemas.context_checker_schemas import (
    BuildChunkContextsInput,
)

from .conftest import make_chunk_payload


class TestBuildChunkContextsBatch:
    @pytest.fixture
    def mock_qdrant(self) -> Generator[MagicMock]:
        with patch("src.activities.context_checker.qdrant_client") as mock:
            yield mock

    @pytest.mark.asyncio
    async def test_empty_input_returns_empty(self, mock_qdrant: MagicMock) -> None:
        result = await build_chunk_contexts_batch(BuildChunkContextsInput(project_id="p", chunk_ids=[]))
        assert result == {}

    @pytest.mark.asyncio
    async def test_chunk_with_no_neighbors(self, mock_qdrant: MagicMock) -> None:
        base = make_chunk_payload(chunk_id="c1", chunk_content="base content")
        mock_qdrant.get_chunk_payloads = AsyncMock(return_value=[base])

        result = await build_chunk_contexts_batch(BuildChunkContextsInput(project_id="p", chunk_ids=["c1"]))

        assert set(result.keys()) == {"c1"}
        ctx = result["c1"]
        assert ctx.chunk_text == "base content"
        assert ctx.preceding_text == ""
        assert ctx.following_text == ""

    @pytest.mark.asyncio
    async def test_chunk_with_prev_and_next_chains(self, mock_qdrant: MagicMock) -> None:
        prev1 = make_chunk_payload(chunk_id="p1", chunk_content="prev-1", previous_chunk_id="p2")
        prev2 = make_chunk_payload(chunk_id="p2", chunk_content="prev-2", previous_chunk_id=None)
        base = make_chunk_payload(
            chunk_id="b", chunk_content="base text",
            previous_chunk_id="p1", next_chunk_id="n1",
        )
        next1 = make_chunk_payload(chunk_id="n1", chunk_content="next-1", next_chunk_id="n2")
        next2 = make_chunk_payload(chunk_id="n2", chunk_content="next-2", next_chunk_id=None)

        cache: dict[str, ChunkPayload] = {
            c.chunk_id: c for c in [prev1, prev2, base, next1, next2]
        }

        async def fake_get(*, project_id: str, chunk_ids: list[str], **_: object) -> list[ChunkPayload]:
            del project_id
            return [cache[cid] for cid in chunk_ids if cid in cache]

        mock_qdrant.get_chunk_payloads = AsyncMock(side_effect=fake_get)

        result = await build_chunk_contexts_batch(BuildChunkContextsInput(project_id="p", chunk_ids=["b"]))

        ctx = result["b"]
        # Preceding text contains both prev1 and prev2 in reading order
        # (MAX_PREVIOUS_CHUNKS allows multi-level preceding context).
        assert "prev-2" in ctx.preceding_text
        assert "prev-1" in ctx.preceding_text
        assert ctx.preceding_text.index("prev-2") < ctx.preceding_text.index("prev-1")
        # Following text contains at least the immediate next chunk.
        assert "next-1" in ctx.following_text

    @pytest.mark.asyncio
    async def test_skips_unknown_chunk_ids(self, mock_qdrant: MagicMock) -> None:
        base = make_chunk_payload(chunk_id="c1")
        mock_qdrant.get_chunk_payloads = AsyncMock(return_value=[base])

        result = await build_chunk_contexts_batch(BuildChunkContextsInput(project_id="p", chunk_ids=["c1", "missing"]))

        assert set(result.keys()) == {"c1"}

    @pytest.mark.asyncio
    async def test_truncates_preceding_text_when_too_long(
        self, mock_qdrant: MagicMock
    ) -> None:
        max_prev = config.CONTEXT_CHECKING.MAX_PREVIOUS_TEXT_CHARS
        huge = "x" * (max_prev * 2)
        prev_chunk = make_chunk_payload(chunk_id="p1", chunk_content=huge, previous_chunk_id=None)
        base = make_chunk_payload(chunk_id="b", chunk_content="base", previous_chunk_id="p1")

        cache = {"b": base, "p1": prev_chunk}

        async def fake_get(*, project_id: str, chunk_ids: list[str], **_: object) -> list[ChunkPayload]:
            del project_id
            return [cache[cid] for cid in chunk_ids if cid in cache]

        mock_qdrant.get_chunk_payloads = AsyncMock(side_effect=fake_get)

        result = await build_chunk_contexts_batch(BuildChunkContextsInput(project_id="p", chunk_ids=["b"]))

        ctx = result["b"]
        assert "TRUNCATED" in ctx.preceding_text
        # Truncation must stay roughly within budget.
        assert len(ctx.preceding_text) < max_prev * 2

    @pytest.mark.asyncio
    async def test_truncates_following_text_when_too_long(
        self, mock_qdrant: MagicMock
    ) -> None:
        max_next = config.CONTEXT_CHECKING.MAX_FOLLOWUP_TEXT_CHARS
        huge = "y" * (max_next * 2)
        next_chunk = make_chunk_payload(chunk_id="n1", chunk_content=huge, next_chunk_id=None)
        base = make_chunk_payload(chunk_id="b", chunk_content="base", next_chunk_id="n1")

        cache = {"b": base, "n1": next_chunk}

        async def fake_get(*, project_id: str, chunk_ids: list[str], **_: object) -> list[ChunkPayload]:
            del project_id
            return [cache[cid] for cid in chunk_ids if cid in cache]

        mock_qdrant.get_chunk_payloads = AsyncMock(side_effect=fake_get)

        result = await build_chunk_contexts_batch(BuildChunkContextsInput(project_id="p", chunk_ids=["b"]))

        ctx = result["b"]
        assert len(ctx.following_text) == max_next

    @pytest.mark.asyncio
    async def test_filters_neighbors_by_top_level_toc_path(
        self, mock_qdrant: MagicMock
    ) -> None:
        base = make_chunk_payload(
            chunk_id="b", chunk_content="base", toc_path=["Chapter 1"],
            previous_chunk_id="p1",
        )
        other_chapter = make_chunk_payload(
            chunk_id="p1", chunk_content="other-chapter", toc_path=["Chapter 2"],
            previous_chunk_id=None,
        )

        cache = {"b": base, "p1": other_chapter}

        async def fake_get(*, project_id: str, chunk_ids: list[str], **_: object) -> list[ChunkPayload]:
            del project_id
            return [cache[cid] for cid in chunk_ids if cid in cache]

        mock_qdrant.get_chunk_payloads = AsyncMock(side_effect=fake_get)

        result = await build_chunk_contexts_batch(BuildChunkContextsInput(project_id="p", chunk_ids=["b"]))

        # Neighbor from a different top-level chapter is excluded.
        assert "other-chapter" not in result["b"].preceding_text


class TestChunkToTextNonText:
    """Extra coverage for the summary-marker wrapping branch."""

    def test_chunk_to_text_with_complete_summary(self) -> None:
        from src.activities.context_checker import _chunk_to_text

        chunk = make_chunk_payload(
            chunk_type="table",
            chunk_content="<table></table>",
            summary="Summary text",
        )
        result = _chunk_to_text(chunk)
        assert config.CONTEXT_CHECKING.LLM_SUMMARY_BEGIN_MARKER in result
        assert config.CONTEXT_CHECKING.LLM_SUMMARY_END_MARKER in result
        assert "Summary text" in result
