from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest
from temporal.workflows.rechtsmethodik.types import RechtsmethodikWorkflowOutput

from src.workflows.batch_mvp.activity import _fetch_project_norms, _process_cached_norm_deconstructions
from src.workflows.batch_mvp.types import CachedNormDeconstructionBatchInput, NormRef, TopicNormRef

MAX_BATCH_SIZE = 10
EXPECTED_INSERT_COUNT = 2
EXPECTED_NORM_COUNT = 125
EXPECTED_UPDATE_CALL_COUNT = 13
EXPECTED_LIST_CALL_COUNT = 13


@pytest.mark.asyncio
async def test_fetch_project_norms_includes_subtopic_owned_norms(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid4()
    topic_id = uuid4()
    missing_topic_id = uuid4()
    direct_topic_norm_id = uuid4()
    subtopic_id = uuid4()
    subtopic_topic_norm_id = uuid4()
    duplicate_subtopic_topic_norm_id = uuid4()
    other_subtopic_id = uuid4()
    other_subtopic_topic_norm_id = uuid4()

    async def fake_list_nodes(project_id: UUID) -> dict[str, Any]:
        return {
            "nodes": [
                {"id": str(topic_id), "node_type": "topic", "parents": []},
                {
                    "id": str(direct_topic_norm_id),
                    "node_type": "topic_norm",
                    "parents": [{"id": str(topic_id), "node_type": "topic"}],
                },
                {
                    "id": str(subtopic_topic_norm_id),
                    "node_type": "topic_norm",
                    "parents": [{"id": str(subtopic_id), "node_type": "subtopic"}],
                },
                {
                    "id": str(duplicate_subtopic_topic_norm_id),
                    "node_type": "topic_norm",
                    "parents": [{"id": str(subtopic_id), "node_type": "subtopic"}],
                },
                {
                    "id": str(other_subtopic_topic_norm_id),
                    "node_type": "topic_norm",
                    "parents": [{"id": str(other_subtopic_id), "node_type": "subtopic"}],
                },
                {
                    "id": str(subtopic_id),
                    "node_type": "subtopic",
                    "parents": [{"id": str(topic_id), "node_type": "topic"}],
                },
                {
                    "id": str(other_subtopic_id),
                    "node_type": "subtopic",
                    "parents": [{"id": str(missing_topic_id), "node_type": "topic"}],
                },
            ]
        }

    async def fake_batch_get_nodes(project_id: UUID, nodes: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "results": [
                {
                    "id": str(direct_topic_norm_id),
                    "node_type": "topic_norm",
                    "topic_id": str(topic_id),
                    "subtopic_id": None,
                    "jurabk": "BImSchG",
                    "paragraph_nr": "3",
                },
                {
                    "id": str(subtopic_topic_norm_id),
                    "node_type": "topic_norm",
                    "topic_id": None,
                    "subtopic_id": str(subtopic_id),
                    "jurabk": "BNatSchG",
                    "paragraph_nr": "44",
                },
                {
                    "id": str(other_subtopic_topic_norm_id),
                    "node_type": "topic_norm",
                    "topic_id": None,
                    "subtopic_id": str(other_subtopic_id),
                    "jurabk": "WHG",
                    "paragraph_nr": "1",
                },
                {
                    "id": str(duplicate_subtopic_topic_norm_id),
                    "node_type": "topic_norm",
                    "topic_id": None,
                    "subtopic_id": str(subtopic_id),
                    "jurabk": "BNatSchG",
                    "paragraph_nr": "§ 44",
                },
            ]
        }

    monkeypatch.setattr(
        "src.workflows.batch_mvp.cached_norm_processing.PlsApiClient.list_nodes",
        fake_list_nodes,
    )
    monkeypatch.setattr(
        "src.workflows.batch_mvp.cached_norm_processing.PlsApiClient.batch_get_nodes",
        fake_batch_get_nodes,
    )

    norms = await _fetch_project_norms(project_id)

    assert [(norm.jurabk, norm.paragraph_nr) for norm in norms] == [
        ("BImSchG", "3"),
        ("BNatSchG", "44"),
    ]


@pytest.mark.asyncio
async def test_fetch_project_norms_reads_topic_norms_in_bounded_batches(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid4()
    topic_id = uuid4()
    topic_norm_ids = [uuid4() for _ in range(EXPECTED_NORM_COUNT)]
    calls: list[list[dict[str, Any]]] = []

    async def fake_list_nodes(project_id: UUID) -> dict[str, Any]:
        return {
            "nodes": [
                {"id": str(topic_id), "node_type": "topic", "parents": []},
                *[
                    {
                        "id": str(topic_norm_id),
                        "node_type": "topic_norm",
                        "parents": [{"id": str(topic_id), "node_type": "topic"}],
                    }
                    for topic_norm_id in topic_norm_ids
                ],
            ]
        }

    async def fake_batch_get_nodes(project_id: UUID, nodes: list[dict[str, Any]]) -> dict[str, Any]:
        calls.append(list(nodes))
        return {
            "results": [
                {
                    "id": node["id"],
                    "node_type": "topic_norm",
                    "topic_id": str(topic_id),
                    "subtopic_id": None,
                    "jurabk": "BNatSchG",
                    "paragraph_nr": str(index),
                }
                for index, node in enumerate(nodes, start=len(calls) * 10 - 9)
            ]
        }

    monkeypatch.setattr(
        "src.workflows.batch_mvp.cached_norm_processing.PlsApiClient.list_nodes",
        fake_list_nodes,
    )
    monkeypatch.setattr(
        "src.workflows.batch_mvp.cached_norm_processing.PlsApiClient.batch_get_nodes",
        fake_batch_get_nodes,
    )

    norms = await _fetch_project_norms(project_id)

    assert len(norms) == len(topic_norm_ids)
    assert all(len(call) <= MAX_BATCH_SIZE for call in calls)


@pytest.mark.asyncio
async def test_process_cached_norm_deconstructions_rereads_graph_before_retry_write(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    topic_id = uuid4()
    topic_norm_id = uuid4()
    stored_nodes: dict[str, dict[str, Any]] = {}
    update_calls: list[tuple[list[dict[str, Any]], list[dict[str, Any]]]] = []
    cached_norm = RechtsmethodikWorkflowOutput(
        gesetz="Bundesnaturschutzgesetz",
        jurabk="BNatSchG",
        standangaben=[],
        paragraph_nr="§ 44",
        paragraph_titel="Titel",
        paragraph_text="Normtext",
        absaetze=[],
        regelungsgegenstand=None,
    )

    async def fake_get_norm_deconstructions(**_kwargs: Any) -> list[dict[str, Any]]:
        return [
            {
                "jurabk": "BNatSchG",
                "paragraph": "44",
                "deconstruction": cached_norm.model_dump(),
            }
        ]

    async def fake_pls_list_nodes(project_id: UUID) -> dict[str, Any]:
        return {
            "nodes": [
                {"id": str(topic_id), "node_type": "topic", "parents": []},
                {
                    "id": str(topic_norm_id),
                    "node_type": "topic_norm",
                    "parents": [{"id": str(topic_id), "node_type": "topic"}],
                },
            ]
        }

    async def fake_pls_batch_get_nodes(project_id: UUID, nodes: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "results": [
                {
                    "id": str(topic_norm_id),
                    "node_type": "topic_norm",
                    "topic_id": str(topic_id),
                    "subtopic_id": None,
                    "jurabk": "BNatSchG",
                    "paragraph_nr": "44",
                }
            ]
        }

    async def fake_examination_list_nodes(project_id: UUID) -> dict[str, Any]:
        nodes: list[dict[str, Any]] = []
        for node in stored_nodes.values():
            summary: dict[str, Any] = {"id": node["id"], "node_type": node["node_type"], "parents": []}
            if node["node_type"] == "norm":
                summary["parents"] = [{"id": node["gesetz_id"], "node_type": "gesetz"}]
            nodes.append(summary)
        return {"nodes": nodes}

    async def fake_examination_batch_get_nodes(project_id: UUID, nodes: list[dict[str, Any]]) -> dict[str, Any]:
        return {"results": [stored_nodes[str(node["id"])] for node in nodes]}

    async def fake_update_nodes(
        project_id: UUID,
        inserts: list[dict[str, Any]],
        updates: list[dict[str, Any]] | None = None,
        deletes: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        update_calls.append((inserts, updates or []))
        for insert in inserts:
            stored_nodes[str(insert["id"])] = {
                "id": insert["id"],
                "node_type": insert["node_type"],
                **insert["payload"],
            }
        for update in updates or []:
            stored_nodes[str(update["id"])].update(update["payload"])
        raise RuntimeError("response lost after graph write")

    monkeypatch.setattr(
        "src.workflows.batch_mvp.cached_norm_processing.ExaminationServiceClient.get_norm_deconstructions",
        fake_get_norm_deconstructions,
    )
    monkeypatch.setattr(
        "src.workflows.batch_mvp.cached_norm_processing.PlsApiClient.list_nodes",
        fake_pls_list_nodes,
    )
    monkeypatch.setattr(
        "src.workflows.batch_mvp.cached_norm_processing.PlsApiClient.batch_get_nodes",
        fake_pls_batch_get_nodes,
    )
    monkeypatch.setattr(
        "src.workflows.batch_mvp.cached_norm_processing.ExaminationServiceClient.list_nodes",
        fake_examination_list_nodes,
    )
    monkeypatch.setattr(
        "src.workflows.batch_mvp.cached_norm_processing.ExaminationServiceClient.batch_get_nodes",
        fake_examination_batch_get_nodes,
    )
    monkeypatch.setattr(
        "src.workflows.batch_mvp.cached_norm_processing.ExaminationServiceClient.update_nodes",
        fake_update_nodes,
    )

    args = CachedNormDeconstructionBatchInput(
        project_id=project_id,
        norms=[NormRef(jurabk="BNatSchG", paragraph_nr="44")],
    )

    with pytest.raises(RuntimeError, match="response lost"):
        await _process_cached_norm_deconstructions(args)

    result = await _process_cached_norm_deconstructions(args)

    assert len(update_calls) == 1
    assert len(update_calls[0][0]) == EXPECTED_INSERT_COUNT
    assert result.uncached_norms == []
    assert len(result.results) == 1
    assert result.results[0].skipped is True


@pytest.mark.asyncio
async def test_process_cached_norm_deconstructions_skips_norm_already_in_graph(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    topic_id = uuid4()
    topic_norm_id = uuid4()
    gesetz_id = uuid4()
    norm_id = uuid4()
    cached_norm = RechtsmethodikWorkflowOutput(
        gesetz="Bundesnaturschutzgesetz",
        jurabk="BNatSchG",
        standangaben=[],
        paragraph_nr="§ 44",
        paragraph_titel="Titel",
        paragraph_text="Normtext",
        absaetze=[],
        regelungsgegenstand=None,
    )
    stored_nodes: dict[str, dict[str, Any]] = {
        str(gesetz_id): {
            "id": str(gesetz_id),
            "node_type": "gesetz",
            "jurabk": "BNatSchG",
            "frontend_parent_ids": [f"topic:{topic_id}"],
        },
        str(norm_id): {
            "id": str(norm_id),
            "node_type": "norm",
            "gesetz_id": str(gesetz_id),
            "paragraph_nr": "§ 44",
            "frontend_parent_ids": [f"topic_norm:{topic_norm_id}"],
        },
    }

    async def fake_get_norm_deconstructions(**_kwargs: Any) -> list[dict[str, Any]]:
        return [
            {
                "jurabk": "BNatSchG",
                "paragraph": "44",
                "deconstruction": cached_norm.model_dump(),
            }
        ]

    async def fake_pls_list_nodes(project_id: UUID) -> dict[str, Any]:
        return {
            "nodes": [
                {"id": str(topic_id), "node_type": "topic", "parents": []},
                {
                    "id": str(topic_norm_id),
                    "node_type": "topic_norm",
                    "parents": [{"id": str(topic_id), "node_type": "topic"}],
                },
            ]
        }

    async def fake_pls_batch_get_nodes(project_id: UUID, nodes: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "results": [
                {
                    "id": str(topic_norm_id),
                    "node_type": "topic_norm",
                    "topic_id": str(topic_id),
                    "subtopic_id": None,
                    "jurabk": "BNatSchG",
                    "paragraph_nr": "44",
                }
            ]
        }

    async def fake_examination_list_nodes(project_id: UUID) -> dict[str, Any]:
        nodes: list[dict[str, Any]] = []
        for node in stored_nodes.values():
            summary: dict[str, Any] = {"id": node["id"], "node_type": node["node_type"], "parents": []}
            if node["node_type"] == "norm":
                summary["parents"] = [{"id": node["gesetz_id"], "node_type": "gesetz"}]
            nodes.append(summary)
        return {"nodes": nodes}

    async def fake_examination_batch_get_nodes(project_id: UUID, nodes: list[dict[str, Any]]) -> dict[str, Any]:
        return {"results": [stored_nodes[str(node["id"])] for node in nodes]}

    async def fail_update_nodes(
        project_id: UUID,
        inserts: list[dict[str, Any]],
        updates: list[dict[str, Any]] | None = None,
        deletes: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        raise AssertionError("already-inserted cached norm should not write again")

    monkeypatch.setattr(
        "src.workflows.batch_mvp.cached_norm_processing.ExaminationServiceClient.get_norm_deconstructions",
        fake_get_norm_deconstructions,
    )
    monkeypatch.setattr(
        "src.workflows.batch_mvp.cached_norm_processing.PlsApiClient.list_nodes",
        fake_pls_list_nodes,
    )
    monkeypatch.setattr(
        "src.workflows.batch_mvp.cached_norm_processing.PlsApiClient.batch_get_nodes",
        fake_pls_batch_get_nodes,
    )
    monkeypatch.setattr(
        "src.workflows.batch_mvp.cached_norm_processing.ExaminationServiceClient.list_nodes",
        fake_examination_list_nodes,
    )
    monkeypatch.setattr(
        "src.workflows.batch_mvp.cached_norm_processing.ExaminationServiceClient.batch_get_nodes",
        fake_examination_batch_get_nodes,
    )
    monkeypatch.setattr(
        "src.workflows.batch_mvp.cached_norm_processing.ExaminationServiceClient.update_nodes",
        fail_update_nodes,
    )

    result = await _process_cached_norm_deconstructions(
        CachedNormDeconstructionBatchInput(
            project_id=project_id,
            norms=[NormRef(jurabk="BNatSchG", paragraph_nr="44")],
        )
    )

    assert result.uncached_norms == []
    assert len(result.results) == 1
    assert result.results[0].skipped is True
    assert result.results[0].gesetz_id == gesetz_id
    assert result.results[0].norm_id == norm_id


@pytest.mark.asyncio
async def test_process_cached_norm_deconstructions_writes_cached_norms_in_batches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    topic_id = uuid4()
    gesetz_id = uuid4()
    norm_ids = [uuid4() for _ in range(EXPECTED_NORM_COUNT)]
    topic_norm_ids = [uuid4() for _ in norm_ids]
    stored_nodes: dict[str, dict[str, Any]] = {
        str(gesetz_id): {
            "id": str(gesetz_id),
            "node_type": "gesetz",
            "jurabk": "BNatSchG",
            "frontend_parent_ids": [f"topic:{topic_id}"],
        }
    }
    for index, norm_id in enumerate(norm_ids, start=1):
        stored_nodes[str(norm_id)] = {
            "id": str(norm_id),
            "node_type": "norm",
            "gesetz_id": str(gesetz_id),
            "paragraph_nr": f"§ {index}",
            "frontend_parent_ids": [],
        }
    update_calls: list[tuple[list[dict[str, Any]], list[dict[str, Any]]]] = []
    batch_get_calls: list[list[dict[str, Any]]] = []
    list_calls = 0

    async def fake_get_norm_deconstructions(
        *, jurabk: str | None = None, paragraph: str | None = None
    ) -> list[dict[str, Any]]:
        return [
            {
                "jurabk": jurabk,
                "paragraph": paragraph,
                "deconstruction": RechtsmethodikWorkflowOutput(
                    gesetz="Bundesnaturschutzgesetz",
                    jurabk="BNatSchG",
                    standangaben=[],
                    paragraph_nr=f"§ {paragraph}",
                    paragraph_titel="Titel",
                    paragraph_text="Normtext",
                    absaetze=[],
                    regelungsgegenstand=None,
                ).model_dump(),
            }
        ]

    async def fake_examination_list_nodes(project_id: UUID) -> dict[str, Any]:
        nonlocal list_calls
        list_calls += 1
        nodes: list[dict[str, Any]] = []
        for node in stored_nodes.values():
            summary: dict[str, Any] = {"id": node["id"], "node_type": node["node_type"], "parents": []}
            if node["node_type"] == "norm":
                summary["parents"] = [{"id": node["gesetz_id"], "node_type": "gesetz"}]
            nodes.append(summary)
        return {"nodes": nodes}

    async def fake_examination_batch_get_nodes(project_id: UUID, nodes: list[dict[str, Any]]) -> dict[str, Any]:
        batch_get_calls.append(list(nodes))
        return {"results": [stored_nodes[str(node["id"])] for node in nodes]}

    async def fake_update_nodes(
        project_id: UUID,
        inserts: list[dict[str, Any]],
        updates: list[dict[str, Any]] | None = None,
        deletes: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        update_calls.append((inserts, updates or []))
        for update in updates or []:
            stored_nodes[str(update["id"])].update(update["payload"])
        return {"inserted": inserts, "updated": updates or []}

    monkeypatch.setattr(
        "src.workflows.batch_mvp.cached_norm_processing.ExaminationServiceClient.get_norm_deconstructions",
        fake_get_norm_deconstructions,
    )
    monkeypatch.setattr(
        "src.workflows.batch_mvp.cached_norm_processing.ExaminationServiceClient.list_nodes",
        fake_examination_list_nodes,
    )
    monkeypatch.setattr(
        "src.workflows.batch_mvp.cached_norm_processing.ExaminationServiceClient.batch_get_nodes",
        fake_examination_batch_get_nodes,
    )
    monkeypatch.setattr(
        "src.workflows.batch_mvp.cached_norm_processing.ExaminationServiceClient.update_nodes",
        fake_update_nodes,
    )

    result = await _process_cached_norm_deconstructions(
        CachedNormDeconstructionBatchInput(
            project_id=project_id,
            norms=[
                NormRef(
                    jurabk="BNatSchG",
                    paragraph_nr=str(index),
                    topic_norms=[
                        TopicNormRef(
                            owner_node_type="topic",
                            owner_node_id=str(topic_id),
                            topic_norm_id=str(topic_norm_id),
                        )
                    ],
                )
                for index, topic_norm_id in enumerate(topic_norm_ids, start=1)
            ],
        )
    )

    assert len(result.results) == EXPECTED_NORM_COUNT
    assert result.uncached_norms == []
    assert len(update_calls) == EXPECTED_UPDATE_CALL_COUNT
    assert [len(updates) for _, updates in update_calls] == [*[MAX_BATCH_SIZE] * 12, 5]
    assert all(not inserts for inserts, _ in update_calls)
    assert list_calls == EXPECTED_LIST_CALL_COUNT
    assert all(len(call) <= MAX_BATCH_SIZE for call in batch_get_calls)
