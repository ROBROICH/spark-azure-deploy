from typing import Any
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.workflows.insert_extraction_results.activity import (
    _batch_insert_extraction_nodes,
    _collect_dependent_refs,
    _GraphState,
    _load_graph_state,
    _process_extraction_batch,
)
from src.workflows.insert_extraction_results.types import (
    BatchInsertExtractionInput,
    DocumentExtractionEntry,
)

# ---------------------------------------------------------------------------
# _collect_dependent_refs tests
# ---------------------------------------------------------------------------


class TestCollectDependentRefs:
    def test_collects_chunks_and_sub_chunks(self) -> None:
        dokument_id = str(uuid4())
        chunk_id = str(uuid4())
        sub_chunk_id = str(uuid4())
        sub_chunk_text_id = str(uuid4())

        graph_nodes: list[dict[str, Any]] = [
            {"node_type": "dokument", "id": dokument_id, "parents": []},
            {
                "node_type": "chunk",
                "id": chunk_id,
                "parents": [{"node_type": "dokument", "id": dokument_id}],
            },
            {
                "node_type": "sub_chunk",
                "id": sub_chunk_id,
                "parents": [{"node_type": "chunk", "id": chunk_id}],
            },
            {
                "node_type": "sub_chunk_text",
                "id": sub_chunk_text_id,
                "parents": [{"node_type": "sub_chunk", "id": sub_chunk_id}],
            },
        ]

        refs = _collect_dependent_refs(graph_nodes, [{"node_type": "dokument", "id": dokument_id}])
        ref_keys = {(r["node_type"], r["id"]) for r in refs}

        assert ("chunk", chunk_id) in ref_keys
        assert ("sub_chunk", sub_chunk_id) in ref_keys
        assert ("sub_chunk_text", sub_chunk_text_id) in ref_keys
        assert ("dokument", dokument_id) not in ref_keys

    def test_collects_markdown_text_for_sub_chunks(self) -> None:
        dokument_id = str(uuid4())
        chunk_id = str(uuid4())
        sub_chunk_id = str(uuid4())
        markdown_text_id = str(uuid4())

        graph_nodes: list[dict[str, Any]] = [
            {"node_type": "dokument", "id": dokument_id, "parents": []},
            {
                "node_type": "chunk",
                "id": chunk_id,
                "parents": [{"node_type": "dokument", "id": dokument_id}],
            },
            {
                "node_type": "sub_chunk",
                "id": sub_chunk_id,
                "parents": [
                    {"node_type": "chunk", "id": chunk_id},
                    {"node_type": "markdown_text", "id": markdown_text_id},
                ],
            },
        ]

        refs = _collect_dependent_refs(graph_nodes, [{"node_type": "dokument", "id": dokument_id}])
        ref_keys = {(r["node_type"], r["id"]) for r in refs}

        assert ("markdown_text", markdown_text_id) in ref_keys

    def test_skips_non_dependent_node_types(self) -> None:
        dokument_id = str(uuid4())
        fundstelle_id = str(uuid4())

        graph_nodes: list[dict[str, Any]] = [
            {"node_type": "dokument", "id": dokument_id, "parents": []},
            {
                "node_type": "fundstelle",
                "id": fundstelle_id,
                "parents": [{"node_type": "dokument", "id": dokument_id}],
            },
        ]

        refs = _collect_dependent_refs(graph_nodes, [{"node_type": "dokument", "id": dokument_id}])
        assert refs == []

    def test_empty_graph_returns_empty(self) -> None:
        refs = _collect_dependent_refs([], [{"node_type": "dokument", "id": str(uuid4())}])
        assert refs == []

    def test_deduplicates_shared_relations(self) -> None:
        dokument_id = str(uuid4())
        chunk_id_a = str(uuid4())
        chunk_id_b = str(uuid4())
        sub_chunk_a = str(uuid4())
        sub_chunk_b = str(uuid4())
        relation_id = str(uuid4())

        graph_nodes: list[dict[str, Any]] = [
            {"node_type": "dokument", "id": dokument_id, "parents": []},
            {
                "node_type": "chunk",
                "id": chunk_id_a,
                "parents": [{"node_type": "dokument", "id": dokument_id}],
            },
            {
                "node_type": "chunk",
                "id": chunk_id_b,
                "parents": [{"node_type": "dokument", "id": dokument_id}],
            },
            {
                "node_type": "sub_chunk",
                "id": sub_chunk_a,
                "parents": [{"node_type": "chunk", "id": chunk_id_a}],
            },
            {
                "node_type": "sub_chunk",
                "id": sub_chunk_b,
                "parents": [{"node_type": "chunk", "id": chunk_id_b}],
            },
            {
                "node_type": "sub_chunk_relation",
                "id": relation_id,
                "parents": [
                    {"node_type": "sub_chunk", "id": sub_chunk_a},
                    {"node_type": "sub_chunk", "id": sub_chunk_b},
                ],
            },
        ]

        refs = _collect_dependent_refs(graph_nodes, [{"node_type": "dokument", "id": dokument_id}])
        relation_refs = [r for r in refs if r["node_type"] == "sub_chunk_relation"]
        assert len(relation_refs) == 1
        assert relation_refs[0]["id"] == relation_id


# ---------------------------------------------------------------------------
# _process_extraction_batch tests
# ---------------------------------------------------------------------------


class TestProcessExtractionBatch:
    @pytest.mark.asyncio
    async def test_skips_fresh_documents(self, monkeypatch: pytest.MonkeyPatch) -> None:
        project_id = uuid4()
        file_id = uuid4()
        dokument_id = uuid4()

        list_nodes = AsyncMock(
            return_value={
                "nodes": [
                    {"node_type": "dokument", "id": str(dokument_id), "parents": []},
                ]
            }
        )
        batch_get = AsyncMock(
            return_value={
                "results": [
                    {
                        "node_type": "dokument",
                        "id": str(dokument_id),
                        "dms_file_id": str(file_id),
                        "is_outdated": False,
                    }
                ]
            }
        )
        update_nodes = AsyncMock()

        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.list_nodes",
            list_nodes,
        )
        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.batch_get_nodes",
            batch_get,
        )
        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.update_nodes",
            update_nodes,
        )

        entries = [
            DocumentExtractionEntry(
                dokument_id=dokument_id,
                source_file_id=file_id,
                has_dokument_id_override=True,
                inserts=[
                    {"node_type": "dokument", "id": str(dokument_id), "payload": {"filename": "test.pdf"}},
                ],
            )
        ]

        state = await _load_graph_state(project_id)
        results = await _process_extraction_batch(project_id, entries, state)

        assert len(results) == 1
        assert results[0].skipped is True
        assert results[0].nodes_inserted == 0
        update_nodes.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_replace_mode_computes_deletes_updates_inserts(self, monkeypatch: pytest.MonkeyPatch) -> None:
        project_id = uuid4()
        file_id = uuid4()
        dokument_id = uuid4()
        old_chunk_id = str(uuid4())
        old_markdown_text_id = str(uuid4())
        new_chunk_id = str(uuid4())
        new_markdown_id = str(uuid4())

        list_nodes = AsyncMock(
            return_value={
                "nodes": [
                    {"node_type": "dokument", "id": str(dokument_id), "parents": []},
                    {
                        "node_type": "chunk",
                        "id": old_chunk_id,
                        "parents": [{"node_type": "dokument", "id": str(dokument_id)}],
                    },
                ]
            }
        )
        batch_get = AsyncMock(
            return_value={
                "results": [
                    {
                        "node_type": "dokument",
                        "id": str(dokument_id),
                        "dms_file_id": str(file_id),
                        "is_outdated": True,
                        "markdown_text_id": old_markdown_text_id,
                    }
                ]
            }
        )
        update_nodes = AsyncMock(return_value={"inserted": [], "updated": [], "deleted": []})

        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.list_nodes",
            list_nodes,
        )
        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.batch_get_nodes",
            batch_get,
        )
        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.update_nodes",
            update_nodes,
        )

        entries = [
            DocumentExtractionEntry(
                dokument_id=dokument_id,
                source_file_id=file_id,
                has_dokument_id_override=True,
                inserts=[
                    {
                        "node_type": "dokument",
                        "id": str(dokument_id),
                        "payload": {"filename": "updated.pdf", "markdown_text_id": new_markdown_id},
                    },
                    {"node_type": "markdown_text", "id": new_markdown_id, "payload": {"text": "new content"}},
                    {"node_type": "chunk", "id": new_chunk_id, "payload": {"dokument_id": str(dokument_id)}},
                ],
            )
        ]

        state = await _load_graph_state(project_id)
        results = await _process_extraction_batch(project_id, entries, state)

        assert len(results) == 1
        assert results[0].skipped is False
        # 2 child inserts + 1 update = 3
        assert results[0].nodes_inserted == 3

        update_nodes.assert_awaited_once()
        call_kwargs = update_nodes.await_args.kwargs
        # Old chunk and old markdown_text should be deleted
        delete_keys = {(d["node_type"], d["id"]) for d in call_kwargs["deletes"]}
        assert ("chunk", old_chunk_id) in delete_keys
        assert ("markdown_text", old_markdown_text_id) in delete_keys
        # Dokument should be updated (not inserted)
        assert len(call_kwargs["updates"]) == 1
        assert call_kwargs["updates"][0]["id"] == str(dokument_id)
        assert call_kwargs["updates"][0]["payload"]["is_outdated"] is False
        # Child nodes should be inserted
        insert_ids = {i["id"] for i in call_kwargs["inserts"]}
        assert new_chunk_id in insert_ids
        assert new_markdown_id in insert_ids

    @pytest.mark.asyncio
    async def test_insert_mode_filters_existing_ids(self, monkeypatch: pytest.MonkeyPatch) -> None:
        project_id = uuid4()
        file_id = uuid4()
        dokument_id = uuid4()
        existing_chunk_id = str(uuid4())
        new_chunk_id = str(uuid4())

        list_nodes = AsyncMock(
            return_value={
                "nodes": [
                    {"node_type": "chunk", "id": existing_chunk_id, "parents": []},
                ]
            }
        )
        batch_get = AsyncMock(return_value={"results": []})
        update_nodes = AsyncMock(return_value={"inserted": []})

        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.list_nodes",
            list_nodes,
        )
        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.batch_get_nodes",
            batch_get,
        )
        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.update_nodes",
            update_nodes,
        )

        entries = [
            DocumentExtractionEntry(
                dokument_id=dokument_id,
                source_file_id=file_id,
                inserts=[
                    {"node_type": "dokument", "id": str(dokument_id), "payload": {"filename": "test.pdf"}},
                    {"node_type": "chunk", "id": existing_chunk_id, "payload": {"order": 0}},
                    {"node_type": "chunk", "id": new_chunk_id, "payload": {"order": 1}},
                ],
            )
        ]

        state = await _load_graph_state(project_id)
        results = await _process_extraction_batch(project_id, entries, state)

        assert len(results) == 1
        assert results[0].skipped is False
        # Only dokument + new_chunk inserted (existing_chunk filtered out)
        assert results[0].nodes_inserted == 2

        call_kwargs = update_nodes.await_args.kwargs
        insert_ids = {i["id"] for i in call_kwargs["inserts"]}
        assert str(dokument_id) in insert_ids
        assert new_chunk_id in insert_ids
        assert existing_chunk_id not in insert_ids

    @pytest.mark.asyncio
    async def test_insert_mode_all_existing_returns_skipped(self, monkeypatch: pytest.MonkeyPatch) -> None:
        project_id = uuid4()
        dokument_id = uuid4()
        chunk_id = str(uuid4())

        list_nodes = AsyncMock(
            return_value={
                "nodes": [
                    {"node_type": "dokument", "id": str(dokument_id), "parents": []},
                    {"node_type": "chunk", "id": chunk_id, "parents": []},
                ]
            }
        )
        batch_get = AsyncMock(return_value={"results": []})
        update_nodes = AsyncMock()

        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.list_nodes",
            list_nodes,
        )
        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.batch_get_nodes",
            batch_get,
        )
        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.update_nodes",
            update_nodes,
        )

        entries = [
            DocumentExtractionEntry(
                dokument_id=dokument_id,
                source_file_id=uuid4(),
                inserts=[
                    {"node_type": "dokument", "id": str(dokument_id), "payload": {}},
                    {"node_type": "chunk", "id": chunk_id, "payload": {}},
                ],
            )
        ]

        state = await _load_graph_state(project_id)
        results = await _process_extraction_batch(project_id, entries, state)

        assert len(results) == 1
        assert results[0].skipped is True
        update_nodes.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_empty_entries_returns_empty(self, monkeypatch: pytest.MonkeyPatch) -> None:
        results = await _process_extraction_batch(uuid4(), [], _GraphState())
        assert results == []

    @pytest.mark.asyncio
    async def test_insert_mode_deletes_stale_subgraph(self, monkeypatch: pytest.MonkeyPatch) -> None:
        project_id = uuid4()
        file_id = uuid4()
        new_dokument_id = uuid4()
        stale_dokument_id = str(uuid4())
        stale_chunk_id = str(uuid4())
        new_chunk_id = str(uuid4())

        list_nodes = AsyncMock(
            return_value={
                "nodes": [
                    {"node_type": "dokument", "id": stale_dokument_id, "parents": []},
                    {
                        "node_type": "chunk",
                        "id": stale_chunk_id,
                        "parents": [{"node_type": "dokument", "id": stale_dokument_id}],
                    },
                ]
            }
        )
        batch_get = AsyncMock(
            return_value={
                "results": [
                    {
                        "node_type": "dokument",
                        "id": stale_dokument_id,
                        "dms_file_id": str(file_id),
                        "is_outdated": True,
                    }
                ]
            }
        )
        update_nodes = AsyncMock(return_value={"inserted": []})

        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.list_nodes",
            list_nodes,
        )
        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.batch_get_nodes",
            batch_get,
        )
        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.update_nodes",
            update_nodes,
        )

        entries = [
            DocumentExtractionEntry(
                dokument_id=new_dokument_id,
                source_file_id=file_id,
                has_dokument_id_override=False,
                inserts=[
                    {"node_type": "dokument", "id": str(new_dokument_id), "payload": {"filename": "test.pdf"}},
                    {"node_type": "chunk", "id": new_chunk_id, "payload": {"order": 0}},
                ],
            )
        ]

        state = await _load_graph_state(project_id)
        results = await _process_extraction_batch(project_id, entries, state)

        assert len(results) == 1
        assert results[0].skipped is False

        call_kwargs = update_nodes.await_args.kwargs
        delete_keys = {(d["node_type"], d["id"]) for d in call_kwargs["deletes"]}
        assert ("chunk", stale_chunk_id) in delete_keys

    @pytest.mark.asyncio
    async def test_insert_mode_deletes_multiple_stale_subgraphs_for_same_file(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """When multiple stale dokuments share the same dms_file_id, all their subgraphs must be cleaned up."""
        project_id = uuid4()
        file_id = uuid4()
        new_dokument_id = uuid4()

        stale_dok_1 = str(uuid4())
        stale_dok_2 = str(uuid4())
        stale_chunk_1 = str(uuid4())
        stale_chunk_2 = str(uuid4())
        new_chunk_id = str(uuid4())

        list_nodes = AsyncMock(
            return_value={
                "nodes": [
                    {"node_type": "dokument", "id": stale_dok_1, "parents": []},
                    {"node_type": "dokument", "id": stale_dok_2, "parents": []},
                    {
                        "node_type": "chunk",
                        "id": stale_chunk_1,
                        "parents": [{"node_type": "dokument", "id": stale_dok_1}],
                    },
                    {
                        "node_type": "chunk",
                        "id": stale_chunk_2,
                        "parents": [{"node_type": "dokument", "id": stale_dok_2}],
                    },
                ]
            }
        )
        batch_get = AsyncMock(
            return_value={
                "results": [
                    {
                        "node_type": "dokument",
                        "id": stale_dok_1,
                        "dms_file_id": str(file_id),
                        "is_outdated": True,
                    },
                    {
                        "node_type": "dokument",
                        "id": stale_dok_2,
                        "dms_file_id": str(file_id),
                        "is_outdated": True,
                    },
                ]
            }
        )
        update_nodes = AsyncMock(return_value={"inserted": []})

        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.list_nodes",
            list_nodes,
        )
        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.batch_get_nodes",
            batch_get,
        )
        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.update_nodes",
            update_nodes,
        )

        entries = [
            DocumentExtractionEntry(
                dokument_id=new_dokument_id,
                source_file_id=file_id,
                has_dokument_id_override=False,
                inserts=[
                    {"node_type": "dokument", "id": str(new_dokument_id), "payload": {"filename": "test.pdf"}},
                    {"node_type": "chunk", "id": new_chunk_id, "payload": {"order": 0}},
                ],
            )
        ]

        state = await _load_graph_state(project_id)
        results = await _process_extraction_batch(project_id, entries, state)

        assert len(results) == 1
        assert results[0].skipped is False

        call_kwargs = update_nodes.await_args.kwargs
        delete_keys = {(d["node_type"], d["id"]) for d in call_kwargs["deletes"]}
        assert ("chunk", stale_chunk_1) in delete_keys
        assert ("chunk", stale_chunk_2) in delete_keys


# ---------------------------------------------------------------------------
# _batch_insert_extraction_nodes tests
# ---------------------------------------------------------------------------


class TestBatchInsertExtractionNodes:
    @pytest.mark.asyncio
    async def test_processes_entries_in_batches(self, monkeypatch: pytest.MonkeyPatch) -> None:
        project_id = uuid4()
        call_count = 0
        list_call_count = 0

        async def mock_list_nodes(pid: Any) -> dict[str, Any]:
            nonlocal list_call_count
            list_call_count += 1
            return {"nodes": []}

        async def mock_batch_get(pid: Any, nodes: Any) -> dict[str, Any]:
            return {"results": []}

        async def mock_update_nodes(pid: Any, **kwargs: Any) -> dict[str, Any]:
            nonlocal call_count
            call_count += 1
            return {"inserted": []}

        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.list_nodes",
            mock_list_nodes,
        )
        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.batch_get_nodes",
            mock_batch_get,
        )
        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.update_nodes",
            mock_update_nodes,
        )

        # Temporarily reduce batch size for testing
        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.EXTRACTION_BATCH_SIZE",
            3,
        )

        entries = [
            DocumentExtractionEntry(
                dokument_id=uuid4(),
                source_file_id=uuid4(),
                inserts=[
                    {"node_type": "dokument", "id": str(uuid4()), "payload": {"filename": f"doc-{i}.pdf"}},
                ],
            )
            for i in range(7)
        ]

        result = await _batch_insert_extraction_nodes(
            BatchInsertExtractionInput(project_id=project_id, entries=entries)
        )

        assert len(result.results) == 7
        # 7 entries / batch_size 3 = 3 batches → 3 update_nodes calls
        assert call_count == 3
        # Graph is read once per activity attempt, not once per batch
        assert list_call_count == 1

    @pytest.mark.asyncio
    async def test_empty_entries_returns_empty_results(self) -> None:
        result = await _batch_insert_extraction_nodes(
            BatchInsertExtractionInput(project_id=uuid4(), entries=[])
        )
        assert result.results == []

    @pytest.mark.asyncio
    async def test_duplicate_file_across_batches_is_skipped(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A file written in an earlier batch counts as fresh for later batches of the same attempt."""
        project_id = uuid4()
        file_id = uuid4()
        update_calls: list[dict[str, Any]] = []

        async def mock_list_nodes(pid: Any) -> dict[str, Any]:
            return {"nodes": []}

        async def mock_batch_get(pid: Any, nodes: Any) -> dict[str, Any]:
            return {"results": []}

        async def mock_update_nodes(pid: Any, **kwargs: Any) -> dict[str, Any]:
            update_calls.append(kwargs)
            return {"inserted": []}

        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.list_nodes",
            mock_list_nodes,
        )
        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.batch_get_nodes",
            mock_batch_get,
        )
        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.ExaminationServiceClient.update_nodes",
            mock_update_nodes,
        )
        monkeypatch.setattr(
            "src.workflows.insert_extraction_results.activity.EXTRACTION_BATCH_SIZE",
            1,
        )

        entries = [
            DocumentExtractionEntry(
                dokument_id=uuid4(),
                source_file_id=file_id,
                inserts=[{"node_type": "dokument", "id": str(uuid4()), "payload": {}}],
            )
            for _ in range(2)
        ]

        result = await _batch_insert_extraction_nodes(
            BatchInsertExtractionInput(project_id=project_id, entries=entries)
        )

        assert result.results[0].skipped is False
        assert result.results[1].skipped is True
        assert len(update_calls) == 1
