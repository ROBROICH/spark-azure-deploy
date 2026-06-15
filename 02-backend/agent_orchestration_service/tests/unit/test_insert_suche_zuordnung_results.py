from itertools import count
from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from temporal.workflows.modul_suche_und_zuordnung.types import PageIndexSVMEntry

from src.workflows.insert_suche_zuordnung_results.activity import (
    WriteSatzFundstellenInput,
    _write_satz_fundstellen,
)
from src.workflows.insert_suche_zuordnung_results.mapper import map_fundstellen
from src.workflows.result_insertion import delete_stale_fundstellen_for_inserts


@pytest.fixture(autouse=True)
def patch_workflow_uuid(monkeypatch: pytest.MonkeyPatch) -> None:
    counter = count()
    monkeypatch.setattr(
        "temporalio.workflow.uuid4",
        lambda: UUID(int=next(counter)),
    )

    async def mock_list_nodes(project_id: UUID) -> dict[str, list[Any]]:
        return {"nodes": []}

    monkeypatch.setattr(
        "src.workflows.result_insertion.ExaminationServiceClient.list_nodes",
        mock_list_nodes,
    )


def test_map_fundstellen_is_deterministic_and_skips_unresolved_documents(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    entry_ok = PageIndexSVMEntry(
        node_id="node-1",
        document_id="file-1",
        title="Title",
        text="Text",
        chunk_ids=["chunk-1"],
        page_numbers=[1],
    )
    entry_missing = PageIndexSVMEntry(
        node_id="node-2",
        document_id="file-2",
        title="Title 2",
        text="Text 2",
        chunk_ids=[],
        page_numbers=[2],
    )

    def reset_counter() -> None:
        counter = count()
        monkeypatch.setattr(
            "temporalio.workflow.uuid4",
            lambda: UUID(int=next(counter)),
        )

    reset_counter()
    first = map_fundstellen(
        [entry_ok, entry_missing],
        chunk_to_dokument={"chunk-1": "doc-1"},
        dms_to_dokument={},
        satz_id="satz-1",
        gesetz_id="gesetz-1",
        norm_id="norm-1",
    )
    reset_counter()
    second = map_fundstellen(
        [entry_ok, entry_missing],
        chunk_to_dokument={"chunk-1": "doc-1"},
        dms_to_dokument={},
        satz_id="satz-1",
        gesetz_id="gesetz-1",
        norm_id="norm-1",
    )

    assert len(first) == 1
    assert first[0]["id"] == second[0]["id"]
    assert first[0]["payload"]["dokument_id"] == "doc-1"


def test_map_fundstellen_uses_dms_document_fallback_when_chunk_mapping_missing() -> None:
    entry = PageIndexSVMEntry(
        node_id="node-1",
        document_id="file-1",
        title="Title",
        text="Text",
        chunk_ids=[],
        page_numbers=[1],
    )

    inserts = map_fundstellen(
        [entry],
        chunk_to_dokument={},
        dms_to_dokument={"file-1": "doc-1"},
        satz_id="satz-1",
        gesetz_id="gesetz-1",
        norm_id="norm-1",
    )

    assert len(inserts) == 1
    assert inserts[0]["payload"]["dokument_id"] == "doc-1"


@pytest.mark.asyncio
async def test_write_satz_fundstellen_precheck_hit_skips_write(monkeypatch: pytest.MonkeyPatch) -> None:
    inserts: list[dict[str, Any]] = [
        {
            "node_type": "fundstelle",
            "id": "fs-0",
            "payload": {"satz_id": "satz-1"},
        }
    ]
    update_nodes = AsyncMock()

    monkeypatch.setattr(
        "src.workflows.result_insertion.ExaminationServiceClient.batch_get_nodes",
        AsyncMock(
            side_effect=lambda project_id, nodes: {
                "results": [{"id": n["id"], "node_type": n["node_type"]} for n in nodes]
            }
        ),
    )
    monkeypatch.setattr(
        "src.workflows.result_insertion.ExaminationServiceClient.update_nodes",
        update_nodes,
    )

    result = await _write_satz_fundstellen(WriteSatzFundstellenInput(project_id=uuid4(), inserts=inserts))

    update_nodes.assert_not_awaited()
    assert result.skipped is False
    assert result.fundstellen_inserted == 1


@pytest.mark.asyncio
async def test_write_satz_fundstellen_precheck_miss_writes_inserts(monkeypatch: pytest.MonkeyPatch) -> None:
    inserts: list[dict[str, Any]] = [
        {
            "node_type": "fundstelle",
            "id": "fs-0",
            "payload": {"satz_id": "satz-1", "dokument_id": "doc-1"},
        }
    ]
    update_nodes = AsyncMock(return_value={"inserted": [{}]})

    monkeypatch.setattr(
        "src.workflows.result_insertion.ExaminationServiceClient.batch_get_nodes",
        AsyncMock(return_value={"results": []}),
    )
    monkeypatch.setattr(
        "src.workflows.result_insertion.ExaminationServiceClient.update_nodes",
        update_nodes,
    )

    result = await _write_satz_fundstellen(WriteSatzFundstellenInput(project_id=uuid4(), inserts=inserts))

    update_nodes.assert_awaited_once()
    assert update_nodes.await_args is not None
    call_kwargs = update_nodes.await_args.kwargs
    assert call_kwargs["inserts"] == inserts
    assert result.fundstellen_inserted == 1


@pytest.mark.asyncio
async def test_write_satz_fundstellen_empty_inserts_returns_skipped() -> None:
    result = await _write_satz_fundstellen(WriteSatzFundstellenInput(project_id=uuid4(), inserts=[]))
    assert result.skipped is True


@pytest.mark.asyncio
async def test_delete_stale_fundstellen_removes_outdated_for_target_satz(monkeypatch: pytest.MonkeyPatch) -> None:
    """Outdated fundstellen matching the target satz_id are deleted."""
    target_satz = "satz-A"
    stale_id = "fs-stale"

    graph_nodes: list[dict[str, Any]] = [
        {"id": stale_id, "node_type": "fundstelle", "is_outdated": True, "parents": []},
        {"id": "fs-fresh", "node_type": "fundstelle", "is_outdated": False, "parents": []},
    ]

    async def mock_list_nodes(project_id: UUID) -> dict[str, list[dict[str, Any]]]:
        return {"nodes": graph_nodes}

    async def mock_batch_get_nodes(project_id: UUID, nodes: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
        results = [{"id": stale_id, "node_type": "fundstelle", "satz_id": target_satz}]
        return {"results": results}

    delete_calls: list[list[dict[str, Any]]] = []

    async def mock_update_nodes(
        project_id: UUID,
        inserts: list[dict[str, Any]],
        updates: list[dict[str, Any]] | None = None,
        deletes: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        delete_calls.append(deletes or [])
        return {}

    monkeypatch.setattr(
        "src.workflows.result_insertion.ExaminationServiceClient.list_nodes",
        mock_list_nodes,
    )
    monkeypatch.setattr(
        "src.workflows.result_insertion.ExaminationServiceClient.batch_get_nodes",
        mock_batch_get_nodes,
    )
    monkeypatch.setattr(
        "src.workflows.result_insertion.ExaminationServiceClient.update_nodes",
        mock_update_nodes,
    )

    inserts: list[dict[str, Any]] = [{"node_type": "fundstelle", "id": "fs-new", "payload": {"satz_id": target_satz}}]
    deleted = await delete_stale_fundstellen_for_inserts(uuid4(), inserts)

    assert deleted == 1
    assert len(delete_calls) == 1
    assert ("fundstelle", stale_id) in {(d["node_type"], d["id"]) for d in delete_calls[0]}


@pytest.mark.asyncio
async def test_delete_stale_fundstellen_no_op_when_none_outdated(monkeypatch: pytest.MonkeyPatch) -> None:
    """Nothing is deleted if no fundstelle is outdated."""

    async def mock_list_nodes(project_id: UUID) -> dict[str, list[dict[str, Any]]]:
        return {"nodes": [{"id": "fs-1", "node_type": "fundstelle", "is_outdated": False, "parents": []}]}

    monkeypatch.setattr(
        "src.workflows.result_insertion.ExaminationServiceClient.list_nodes",
        mock_list_nodes,
    )

    inserts: list[dict[str, Any]] = [{"node_type": "fundstelle", "id": "fs-new", "payload": {"satz_id": "satz-1"}}]
    deleted = await delete_stale_fundstellen_for_inserts(uuid4(), inserts)
    assert deleted == 0


@pytest.mark.asyncio
async def test_delete_stale_fundstellen_only_deletes_matching_satz(monkeypatch: pytest.MonkeyPatch) -> None:
    """Only fundstellen belonging to the target satz_id are deleted."""
    target_satz = "satz-A"
    other_satz = "satz-B"

    graph_nodes: list[dict[str, Any]] = [
        {"id": "fs-target", "node_type": "fundstelle", "is_outdated": True, "parents": []},
        {"id": "fs-other", "node_type": "fundstelle", "is_outdated": True, "parents": []},
    ]

    async def mock_list_nodes(project_id: UUID) -> dict[str, list[dict[str, Any]]]:
        return {"nodes": graph_nodes}

    async def mock_batch_get_nodes(project_id: UUID, nodes: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
        return {
            "results": [
                {"id": "fs-target", "node_type": "fundstelle", "satz_id": target_satz},
                {"id": "fs-other", "node_type": "fundstelle", "satz_id": other_satz},
            ]
        }

    delete_calls: list[list[dict[str, Any]]] = []

    async def mock_update_nodes(
        project_id: UUID,
        inserts: list[dict[str, Any]],
        updates: list[dict[str, Any]] | None = None,
        deletes: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        delete_calls.append(deletes or [])
        return {}

    monkeypatch.setattr(
        "src.workflows.result_insertion.ExaminationServiceClient.list_nodes",
        mock_list_nodes,
    )
    monkeypatch.setattr(
        "src.workflows.result_insertion.ExaminationServiceClient.batch_get_nodes",
        mock_batch_get_nodes,
    )
    monkeypatch.setattr(
        "src.workflows.result_insertion.ExaminationServiceClient.update_nodes",
        mock_update_nodes,
    )

    inserts: list[dict[str, Any]] = [{"node_type": "fundstelle", "id": "fs-new", "payload": {"satz_id": target_satz}}]
    deleted = await delete_stale_fundstellen_for_inserts(uuid4(), inserts)

    assert deleted == 1
    deleted_refs = {(d["node_type"], d["id"]) for d in delete_calls[0]}
    assert ("fundstelle", "fs-target") in deleted_refs
    assert ("fundstelle", "fs-other") not in deleted_refs
