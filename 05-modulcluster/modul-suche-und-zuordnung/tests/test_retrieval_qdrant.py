"""
Tests for the Qdrant batch retrieval pipeline in src/tbm_matching/retrieval.py.

Uses mock for the module-level _qdrant client to test _batch_retrieval logic
without requiring a running Qdrant instance.
"""

from collections.abc import Iterator
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from src.tbm_matching import retrieval

# --- Constants for PLR2004 compliance ---
EXPECTED_PREFETCH_COUNT = 2  # hybrid requests have 2 prefetch sub-requests (dense + sparse)
EXPECTED_CHUNK_COUNT = 2  # number of distinct chunks returned in multi-chunk assertions
EXPECTED_TOP_SCORE = 0.9  # score assigned to the highest-scoring mock point


def _make_point(score: float, payload: dict[str, object]) -> SimpleNamespace:
    """Create a mock ScoredPoint-like object."""
    return SimpleNamespace(score=score, payload=payload)


def _make_batch_response(points_list: list[list[SimpleNamespace]]) -> list[SimpleNamespace]:
    """Create a list of batch response objects each with a .points attribute."""
    return [SimpleNamespace(points=pts) for pts in points_list]


@pytest.fixture(autouse=True)
def _clear_vector_cache() -> Iterator[None]:
    """Clear the module-level cache before each test."""
    retrieval._collection_vector_cache.clear()
    yield
    retrieval._collection_vector_cache.clear()


class TestCollectionHasSparse:
    """Tests for _collection_has_sparse cache + detection logic."""

    def test_detects_sparse_present(self) -> None:
        mock_info = SimpleNamespace(config=SimpleNamespace(params=SimpleNamespace(vectors={"dense": {}, "sparse": {}})))
        with patch.object(retrieval, "_qdrant") as mock_q:
            mock_q.get_collection.return_value = mock_info
            assert retrieval._collection_has_sparse("test_coll") is True

    def test_detects_sparse_absent(self) -> None:
        mock_info = SimpleNamespace(config=SimpleNamespace(params=SimpleNamespace(vectors={"dense": {}})))
        with patch.object(retrieval, "_qdrant") as mock_q:
            mock_q.get_collection.return_value = mock_info
            assert retrieval._collection_has_sparse("test_coll") is False

    def test_non_mapping_vectors_defaults_to_dense(self) -> None:
        mock_info = SimpleNamespace(config=SimpleNamespace(params=SimpleNamespace(vectors="single_vector_config")))
        with patch.object(retrieval, "_qdrant") as mock_q:
            mock_q.get_collection.return_value = mock_info
            assert retrieval._collection_has_sparse("test_coll") is False

    def test_uses_cache_on_second_call(self) -> None:
        retrieval._collection_vector_cache["cached_coll"] = {"dense", "sparse"}
        with patch.object(retrieval, "_qdrant") as mock_q:
            assert retrieval._collection_has_sparse("cached_coll") is True
            mock_q.get_collection.assert_not_called()


class TestBuildQueryRequest:
    """Tests for _build_query_request with and without sparse vectors."""

    def test_hybrid_request_when_sparse_available(self) -> None:
        retrieval._collection_vector_cache[retrieval.collection_name] = {"dense", "sparse"}
        req = retrieval._build_query_request(
            query_text="test",
            embedding=[0.1, 0.2],
            threshold=0.5,
            limit=10,
            project_id="p1",
            type_value="chunk",
        )
        assert req.prefetch is not None
        assert isinstance(req.prefetch, list)
        assert len(req.prefetch) == EXPECTED_PREFETCH_COUNT

    def test_dense_only_request_when_no_sparse(self) -> None:
        retrieval._collection_vector_cache[retrieval.collection_name] = {"dense"}
        req = retrieval._build_query_request(
            query_text="test",
            embedding=[0.1, 0.2],
            threshold=0.5,
            limit=10,
            project_id="p1",
            type_value="chunk",
        )
        assert req.prefetch is None
        assert req.query == [0.1, 0.2]


@pytest.mark.asyncio
class TestBatchRetrieval:
    """Tests for _batch_retrieval with mocked Qdrant calls."""

    async def test_empty_queries_returns_empty(self) -> None:
        result = await retrieval._batch_retrieval(
            queries=[],
            embeddings=[],
            project_id="p1",
            threshold=0.5,
            type_value="chunk",
            merge_key="chunk_id",
        )
        assert result == []

    async def test_single_query_returns_merged(self) -> None:
        points = [
            _make_point(
                0.9, {"chunk_id": "c1", "document_id": "d1", "project_id": "p1", "metadata": {"title": "Doc1"}}
            ),
            _make_point(
                0.8, {"chunk_id": "c2", "document_id": "d1", "project_id": "p1", "metadata": {"title": "Doc1"}}
            ),
        ]
        batch_resp = _make_batch_response([points])

        retrieval._collection_vector_cache[retrieval.collection_name] = {"dense"}
        with patch.object(retrieval, "_qdrant") as mock_q:
            mock_q.query_batch_points.return_value = batch_resp
            result = await retrieval._batch_retrieval(
                queries=["test"],
                embeddings=[[0.1]],
                project_id="p1",
                threshold=0.5,
                type_value="chunk",
                merge_key="chunk_id",
                include_chunk_id=True,
            )

        assert len(result) == 1
        assert len(result[0]) == EXPECTED_CHUNK_COUNT
        assert result[0][0]["score"] == EXPECTED_TOP_SCORE
        assert result[0][0]["chunk_id"] == "c1"

    async def test_merge_by_document_id(self) -> None:
        points = [
            _make_point(
                0.9, {"chunk_id": "c1", "document_id": "d1", "project_id": "p1", "metadata": {"title": "Doc1"}}
            ),
            _make_point(
                0.8, {"chunk_id": "c2", "document_id": "d1", "project_id": "p1", "metadata": {"title": "Doc1"}}
            ),
        ]
        batch_resp = _make_batch_response([points])

        retrieval._collection_vector_cache[retrieval.collection_name] = {"dense"}
        with patch.object(retrieval, "_qdrant") as mock_q:
            mock_q.query_batch_points.return_value = batch_resp
            result = await retrieval._batch_retrieval(
                queries=["test"],
                embeddings=[[0.1]],
                project_id="p1",
                threshold=0.5,
                type_value="summary",
                merge_key="document_id",
            )

        # Both chunks have same document_id — should merge to 1 entry with best score
        assert len(result) == 1
        assert len(result[0]) == 1
        assert result[0][0]["score"] == EXPECTED_TOP_SCORE

    async def test_filter_blocklist_applied(self) -> None:
        """filter_documents checks Header 1 on the normalized entry dict.
        Since _batch_retrieval currently does not carry 'Header 1' from the
        raw payload into the entry, the blocklist filter is effectively a no-op.
        This test documents that current behaviour.
        """
        points = [
            _make_point(
                0.9,
                {
                    "chunk_id": "c1",
                    "document_id": "d1",
                    "project_id": "p1",
                    "metadata": {"title": "Good Document"},
                },
            ),
            _make_point(
                0.8,
                {
                    "chunk_id": "c2",
                    "document_id": "d2",
                    "project_id": "p1",
                    "metadata": {"title": "Bad Document"},
                    "Header 1": "Inhaltsverzeichnis",
                },
            ),
        ]
        batch_resp = _make_batch_response([points])

        retrieval._collection_vector_cache[retrieval.collection_name] = {"dense"}
        with patch.object(retrieval, "_qdrant") as mock_q:
            mock_q.query_batch_points.return_value = batch_resp
            result = await retrieval._batch_retrieval(
                queries=["test"],
                embeddings=[[0.1]],
                project_id="p1",
                threshold=0.5,
                type_value="chunk",
                merge_key="chunk_id",
                include_chunk_id=True,
                filter_blocklist=True,
            )

        # Header 1 is not in the normalized entry, so both entries remain
        assert len(result[0]) == EXPECTED_CHUNK_COUNT

    async def test_skip_points_without_key(self) -> None:
        points = [
            _make_point(0.9, {"chunk_id": None, "document_id": None, "project_id": "p1", "metadata": {}}),
        ]
        batch_resp = _make_batch_response([points])

        retrieval._collection_vector_cache[retrieval.collection_name] = {"dense"}
        with patch.object(retrieval, "_qdrant") as mock_q:
            mock_q.query_batch_points.return_value = batch_resp
            result = await retrieval._batch_retrieval(
                queries=["test"],
                embeddings=[[0.1]],
                project_id="p1",
                threshold=0.5,
                type_value="chunk",
                merge_key="chunk_id",
            )

        assert len(result[0]) == 0

    async def test_merge_key_chunk_id_or_document_id(self) -> None:
        points = [
            _make_point(
                0.9, {"chunk_id": "c1", "document_id": "d1", "project_id": "p1", "metadata": {"title": "Doc1"}}
            ),
            _make_point(
                0.7, {"chunk_id": None, "document_id": "d2", "project_id": "p1", "metadata": {"title": "Doc2"}}
            ),
        ]
        batch_resp = _make_batch_response([points])

        retrieval._collection_vector_cache[retrieval.collection_name] = {"dense"}
        with patch.object(retrieval, "_qdrant") as mock_q:
            mock_q.query_batch_points.return_value = batch_resp
            result = await retrieval._batch_retrieval(
                queries=["test"],
                embeddings=[[0.1]],
                project_id="p1",
                threshold=0.5,
                type_value="question",
                merge_key="chunk_id_or_document_id",
                include_chunk_id=True,
            )

        assert len(result[0]) == EXPECTED_CHUNK_COUNT

    async def test_title_fallback_to_payload_title(self) -> None:
        points = [
            _make_point(
                0.9,
                {"chunk_id": "c1", "document_id": "d1", "project_id": "p1", "title": "Fallback Title", "metadata": {}},
            ),
        ]
        batch_resp = _make_batch_response([points])

        retrieval._collection_vector_cache[retrieval.collection_name] = {"dense"}
        with patch.object(retrieval, "_qdrant") as mock_q:
            mock_q.query_batch_points.return_value = batch_resp
            result = await retrieval._batch_retrieval(
                queries=["test"],
                embeddings=[[0.1]],
                project_id="p1",
                threshold=0.5,
                type_value="chunk",
                merge_key="chunk_id",
            )

        assert result[0][0]["title"] == "Fallback Title"

    async def test_higher_score_wins_on_merge(self) -> None:
        points = [
            _make_point(0.7, {"chunk_id": "c1", "document_id": "d1", "project_id": "p1", "metadata": {"title": "Old"}}),
            _make_point(0.9, {"chunk_id": "c1", "document_id": "d1", "project_id": "p1", "metadata": {"title": "New"}}),
        ]
        batch_resp = _make_batch_response([points])

        retrieval._collection_vector_cache[retrieval.collection_name] = {"dense"}
        with patch.object(retrieval, "_qdrant") as mock_q:
            mock_q.query_batch_points.return_value = batch_resp
            result = await retrieval._batch_retrieval(
                queries=["test"],
                embeddings=[[0.1]],
                project_id="p1",
                threshold=0.5,
                type_value="chunk",
                merge_key="chunk_id",
            )

        assert result[0][0]["score"] == EXPECTED_TOP_SCORE
        assert result[0][0]["title"] == "New"

    async def test_null_payload_skipped(self) -> None:
        points = [SimpleNamespace(score=0.9, payload=None)]
        batch_resp = _make_batch_response([points])

        retrieval._collection_vector_cache[retrieval.collection_name] = {"dense"}
        with patch.object(retrieval, "_qdrant") as mock_q:
            mock_q.query_batch_points.return_value = batch_resp
            result = await retrieval._batch_retrieval(
                queries=["test"],
                embeddings=[[0.1]],
                project_id="p1",
                threshold=0.5,
                type_value="chunk",
                merge_key="chunk_id",
            )

        assert result[0] == []
