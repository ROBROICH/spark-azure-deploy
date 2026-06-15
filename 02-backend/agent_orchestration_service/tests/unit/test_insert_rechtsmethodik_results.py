from itertools import count
from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from temporal.workflows.rechtsmethodik.types import (
    Absatz,
    AtomaresTBM,
    Auslegungsvorschlag,
    Rechtsbegriffe,
    Rechtsfolge,
    RechtsmethodikWorkflowOutput,
    RechtsmethodikWorkflowSatzOutput,
    UnbestimmterRechtsbegriff,
    Verweise,
)
from temporalio.exceptions import ApplicationError

from src.workflows.insert_rechtsmethodik_results.activity import (
    _build_inserts_and_updates,
    _fetch_examination_rechtsmethodik_context,
    _fetch_pls_topic_norms,
    _insert_rechtsmethodik_result,
)
from src.workflows.insert_rechtsmethodik_results.linking import (
    TopicNormMatch,
    build_topic_norm_matches,
)
from src.workflows.insert_rechtsmethodik_results.types import (
    ExaminationRechtsmethodikContext,
    InsertRechtsmethodikResultOutput,
    WriteRechtsmethodikResultInput,
)

EXPECTED_NORM_COUNT = 125
EXPECTED_UPDATE_COUNT = 2
EXPECTED_NODES_INSERTED = 2


@pytest.fixture(autouse=True)
def patch_workflow_uuid(monkeypatch: pytest.MonkeyPatch) -> None:
    counter = count(1)
    monkeypatch.setattr(
        "temporalio.workflow.uuid4",
        lambda: UUID(int=next(counter)),
    )


def test_build_topic_norm_matches_returns_all_project_matches_for_same_norm() -> None:
    topic_id_1 = UUID("00000000-0000-0000-0000-000000000001")
    topic_id_2 = UUID("00000000-0000-0000-0000-000000000002")
    topic_norm_id_1 = UUID("00000000-0000-0000-0000-000000000011")
    topic_norm_id_2 = UUID("00000000-0000-0000-0000-000000000012")

    matches = build_topic_norm_matches(
        [
            {
                "id": str(topic_norm_id_2),
                "topic_id": str(topic_id_2),
                "jurabk": "BNatSchG",
                "paragraph_nr": "§ 44",
            },
            {
                "id": str(topic_norm_id_1),
                "topic_id": str(topic_id_1),
                "jurabk": "BNatSchG",
                "paragraph_nr": "44",
            },
        ]
    )

    assert matches[("BNatSchG", "44")] == [
        TopicNormMatch(owner_node_type="topic", owner_node_id=str(topic_id_1), topic_norm_id=str(topic_norm_id_1)),
        TopicNormMatch(owner_node_type="topic", owner_node_id=str(topic_id_2), topic_norm_id=str(topic_norm_id_2)),
    ]


def _norm_result_minimal() -> RechtsmethodikWorkflowOutput:
    return RechtsmethodikWorkflowOutput(
        gesetz="Bundesnaturschutzgesetz",
        jurabk="BNatSchG",
        standangaben=[],
        paragraph_nr="§ 44",
        paragraph_titel="Titel",
        paragraph_text="Normtext",
        absaetze=[],
        regelungsgegenstand=None,
    )


def _norm_result_with_unbestimmter_auslegung(auslegung: str) -> RechtsmethodikWorkflowOutput:
    return RechtsmethodikWorkflowOutput(
        gesetz="Bundesnaturschutzgesetz",
        jurabk="BNatSchG",
        standangaben=[],
        paragraph_nr="§ 44",
        paragraph_titel="Titel",
        paragraph_text="Normtext",
        absaetze=[
            Absatz(
                absatz_nr="1",
                absatz_text="Absatztext",
                saetze=[
                    RechtsmethodikWorkflowSatzOutput(
                        satz_nr="1",
                        markers=[],
                        satz_text="Satztext",
                        norm_typ_lvl_1="materiell-rechtlich",
                        norm_typ_lvl_2="wenn-dann",
                        tatbestandsmerkmale=["TBM"],
                        atomare_tatbestandsmerkmale=[
                            AtomaresTBM(
                                text="TBM",
                                verweise=Verweise(explizit=[], implizit=[]),
                                prueffrage="Prueffrage?",
                                pruefgegenstand="Pruefgegenstand",
                                rechtsbegriffe=Rechtsbegriffe(
                                    bestimmte_rechtsbegriffe=[],
                                    unbestimmte_rechtsbegriffe=[
                                        UnbestimmterRechtsbegriff.model_validate(
                                            {
                                                "begriff": "oeffentliches Interesse",
                                                "auslegungsvorschl\u00e4ge": [
                                                    Auslegungsvorschlag(
                                                        auslegung_methode="wortlaut",
                                                        auslegungsvorschlag="Wortlaut interpretation",
                                                    )
                                                ],
                                                "auslegung": auslegung,
                                            }
                                        )
                                    ],
                                ),
                            )
                        ],
                    )
                ],
            )
        ],
        regelungsgegenstand=None,
    )


@pytest.mark.asyncio
async def test_fetch_pls_topic_norms_keeps_subtopic_norms_under_active_topics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    topic_id = UUID("00000000-0000-0000-0000-000000000001")
    missing_topic_id = UUID("00000000-0000-0000-0000-000000000002")
    subtopic_id = UUID("00000000-0000-0000-0000-000000000003")
    orphan_subtopic_id = UUID("00000000-0000-0000-0000-000000000004")
    direct_topic_norm_id = UUID("00000000-0000-0000-0000-000000000011")
    subtopic_topic_norm_id = UUID("00000000-0000-0000-0000-000000000012")
    orphan_topic_norm_id = UUID("00000000-0000-0000-0000-000000000013")
    requested_refs: list[dict[str, Any]] = []

    async def fake_list_nodes(project_id: UUID) -> dict[str, Any]:
        return {
            "nodes": [
                {"id": str(topic_id), "node_type": "topic", "parents": []},
                {
                    "id": str(subtopic_id),
                    "node_type": "subtopic",
                    "parents": [{"id": str(topic_id), "node_type": "topic"}],
                },
                {
                    "id": str(orphan_subtopic_id),
                    "node_type": "subtopic",
                    "parents": [{"id": str(missing_topic_id), "node_type": "topic"}],
                },
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
                    "id": str(orphan_topic_norm_id),
                    "node_type": "topic_norm",
                    "parents": [{"id": str(orphan_subtopic_id), "node_type": "subtopic"}],
                },
            ]
        }

    async def fake_batch_get_nodes(project_id: UUID, nodes: list[dict[str, Any]]) -> dict[str, Any]:
        requested_refs.extend(nodes)
        return {
            "results": [
                {
                    "id": str(node["id"]),
                    "node_type": "topic_norm",
                    "topic_id": str(topic_id) if node["id"] == str(direct_topic_norm_id) else None,
                    "subtopic_id": str(subtopic_id) if node["id"] == str(subtopic_topic_norm_id) else None,
                    "jurabk": "BNatSchG",
                    "paragraph_nr": "44",
                }
                for node in nodes
            ]
        }

    monkeypatch.setattr(
        "src.workflows.insert_rechtsmethodik_results.activity.PlsApiClient.list_nodes",
        fake_list_nodes,
    )
    monkeypatch.setattr(
        "src.workflows.insert_rechtsmethodik_results.activity.PlsApiClient.batch_get_nodes",
        fake_batch_get_nodes,
    )

    topic_norms = await _fetch_pls_topic_norms(project_id)

    assert [ref["id"] for ref in requested_refs] == [
        str(direct_topic_norm_id),
        str(subtopic_topic_norm_id),
    ]
    assert [topic_norm["id"] for topic_norm in topic_norms] == [
        str(direct_topic_norm_id),
        str(subtopic_topic_norm_id),
    ]


@pytest.mark.asyncio
async def test_fetch_examination_context_reads_all_nodes_in_single_batch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    norm_ids = [uuid4() for _ in range(EXPECTED_NORM_COUNT)]
    calls: list[list[dict[str, Any]]] = []

    async def fake_list_nodes(project_id: UUID) -> dict[str, Any]:
        return {"nodes": [{"id": str(norm_id), "node_type": "norm"} for norm_id in norm_ids]}

    async def fake_batch_get_nodes(project_id: UUID, nodes: list[dict[str, Any]]) -> dict[str, Any]:
        calls.append(list(nodes))
        return {
            "results": [
                {
                    "id": node["id"],
                    "node_type": "norm",
                    "gesetz_id": str(uuid4()),
                    "paragraph_nr": "44",
                }
                for node in nodes
            ]
        }

    monkeypatch.setattr(
        "src.workflows.insert_rechtsmethodik_results.activity.ExaminationServiceClient.list_nodes",
        fake_list_nodes,
    )
    monkeypatch.setattr(
        "src.workflows.insert_rechtsmethodik_results.activity.ExaminationServiceClient.batch_get_nodes",
        fake_batch_get_nodes,
    )

    context = await _fetch_examination_rechtsmethodik_context(project_id)

    assert len(context.norms) == len(norm_ids)
    assert len(calls) == 1
    assert len(calls[0]) == EXPECTED_NORM_COUNT


def test_build_inserts_creates_single_gesetz_norm_with_all_parent_refs() -> None:
    project_id = uuid4()
    topic_id_1 = UUID("00000000-0000-0000-0000-000000000001")
    topic_id_2 = UUID("00000000-0000-0000-0000-000000000002")
    topic_norm_id_1 = UUID("00000000-0000-0000-0000-000000000011")
    topic_norm_id_2 = UUID("00000000-0000-0000-0000-000000000012")

    topic_norms = [
        {
            "id": str(topic_norm_id_1),
            "topic_id": str(topic_id_1),
            "jurabk": "BNatSchG",
            "paragraph_nr": "44",
        },
        {
            "id": str(topic_norm_id_2),
            "topic_id": str(topic_id_2),
            "jurabk": "BNatSchG",
            "paragraph_nr": "§ 44",
        },
    ]

    inserts, updates, gesetz_id, norm_id = _build_inserts_and_updates(
        project_id=project_id,
        norm_result=_norm_result_minimal(),
        context=ExaminationRechtsmethodikContext(),
        topic_norms=topic_norms,
    )

    gesetz_inserts = [i for i in inserts if i["node_type"] == "gesetz"]
    norm_inserts = [i for i in inserts if i["node_type"] == "norm"]
    assert len(gesetz_inserts) == 1
    assert len(norm_inserts) == 1
    assert gesetz_inserts[0]["id"] == str(gesetz_id)
    assert norm_inserts[0]["id"] == str(norm_id)
    assert gesetz_inserts[0]["payload"]["frontend_parent_ids"] == sorted(
        [
            f"topic:{topic_id_1}",
            f"topic:{topic_id_2}",
        ]
    )
    assert norm_inserts[0]["payload"]["frontend_parent_ids"] == sorted(
        [
            f"topic_norm:{topic_norm_id_1}",
            f"topic_norm:{topic_norm_id_2}",
        ]
    )
    assert updates == []


def test_build_inserts_preserves_unbestimmter_rechtsbegriff_auslegung() -> None:
    project_id = uuid4()
    topic_id = UUID("00000000-0000-0000-0000-000000000001")
    topic_norm_id = UUID("00000000-0000-0000-0000-000000000011")
    norm_result = _norm_result_with_unbestimmter_auslegung("Final interpretation")
    topic_norms = [
        {
            "id": str(topic_norm_id),
            "topic_id": str(topic_id),
            "jurabk": "BNatSchG",
            "paragraph_nr": "44",
        }
    ]

    inserts, updates, _, _ = _build_inserts_and_updates(
        project_id=project_id,
        norm_result=norm_result,
        context=ExaminationRechtsmethodikContext(),
        topic_norms=topic_norms,
    )

    unbestimmter_insert = next(i for i in inserts if i["node_type"] == "unbestimmter_rechtsbegriff")
    assert unbestimmter_insert["payload"]["auslegung"] == "Final interpretation"
    assert updates == []


def test_build_inserts_uses_subtopic_owner_for_subtopic_topic_norms() -> None:
    project_id = uuid4()
    topic_id = UUID("00000000-0000-0000-0000-000000000001")
    subtopic_id = UUID("00000000-0000-0000-0000-000000000003")
    direct_topic_norm_id = UUID("00000000-0000-0000-0000-000000000011")
    subtopic_topic_norm_id = UUID("00000000-0000-0000-0000-000000000012")

    topic_norms: list[dict[str, Any]] = [
        {
            "id": str(direct_topic_norm_id),
            "topic_id": str(topic_id),
            "subtopic_id": None,
            "jurabk": "BNatSchG",
            "paragraph_nr": "44",
        },
        {
            "id": str(subtopic_topic_norm_id),
            "topic_id": None,
            "subtopic_id": str(subtopic_id),
            "jurabk": "BNatSchG",
            "paragraph_nr": "§ 44",
        },
    ]

    inserts, updates, _, _ = _build_inserts_and_updates(
        project_id=project_id,
        norm_result=_norm_result_minimal(),
        context=ExaminationRechtsmethodikContext(),
        topic_norms=topic_norms,
    )

    gesetz_insert = next(i for i in inserts if i["node_type"] == "gesetz")
    norm_insert = next(i for i in inserts if i["node_type"] == "norm")
    assert gesetz_insert["payload"]["frontend_parent_ids"] == sorted(
        [
            f"topic:{topic_id}",
            f"subtopic:{subtopic_id}",
        ]
    )
    assert norm_insert["payload"]["frontend_parent_ids"] == sorted(
        [
            f"topic_norm:{direct_topic_norm_id}",
            f"topic_norm:{subtopic_topic_norm_id}",
        ]
    )
    assert updates == []


def test_build_inserts_merges_frontend_parent_ids_when_both_exist() -> None:
    project_id = uuid4()
    topic_id_1 = UUID("00000000-0000-0000-0000-000000000001")
    topic_id_2 = UUID("00000000-0000-0000-0000-000000000002")
    topic_norm_id_1 = UUID("00000000-0000-0000-0000-000000000011")
    topic_norm_id_2 = UUID("00000000-0000-0000-0000-000000000012")
    existing_gesetz_id = uuid4()
    existing_norm_id = uuid4()

    topic_norms = [
        {
            "id": str(topic_norm_id_1),
            "topic_id": str(topic_id_1),
            "jurabk": "BNatSchG",
            "paragraph_nr": "44",
        },
        {
            "id": str(topic_norm_id_2),
            "topic_id": str(topic_id_2),
            "jurabk": "BNatSchG",
            "paragraph_nr": "§ 44",
        },
    ]
    context = ExaminationRechtsmethodikContext(
        gesetze=[
            {
                "id": str(existing_gesetz_id),
                "jurabk": "BNatSchG",
                "name": "Bundesnaturschutzgesetz",
                "frontend_parent_ids": [f"topic:{topic_id_1}"],
            }
        ],
        norms=[
            {
                "id": str(existing_norm_id),
                "gesetz_id": str(existing_gesetz_id),
                "paragraph_nr": "§ 44",
                "frontend_parent_ids": [f"topic_norm:{topic_norm_id_1}"],
            }
        ],
    )

    inserts, updates, gesetz_id, norm_id = _build_inserts_and_updates(
        project_id=project_id,
        norm_result=_norm_result_minimal(),
        context=context,
        topic_norms=topic_norms,
    )

    assert inserts == []
    assert gesetz_id == existing_gesetz_id
    assert norm_id == existing_norm_id
    assert len(updates) == EXPECTED_UPDATE_COUNT

    gesetz_update = next(u for u in updates if u["node_type"] == "gesetz")
    norm_update = next(u for u in updates if u["node_type"] == "norm")
    assert gesetz_update["payload"]["frontend_parent_ids"] == sorted(
        [
            f"topic:{topic_id_1}",
            f"topic:{topic_id_2}",
        ]
    )
    assert norm_update["payload"]["frontend_parent_ids"] == sorted(
        [
            f"topic_norm:{topic_norm_id_1}",
            f"topic_norm:{topic_norm_id_2}",
        ]
    )


def test_build_inserts_reuses_existing_gesetz_and_creates_new_norm() -> None:
    project_id = uuid4()
    topic_id = UUID("00000000-0000-0000-0000-000000000001")
    topic_norm_id = UUID("00000000-0000-0000-0000-000000000011")
    existing_gesetz_id = uuid4()

    norm_result = RechtsmethodikWorkflowOutput(
        gesetz="Bundesnaturschutzgesetz",
        jurabk="BNatSchG",
        standangaben=[],
        paragraph_nr="§ 45",
        paragraph_titel="Titel",
        paragraph_text="Normtext",
        absaetze=[],
        regelungsgegenstand=None,
    )
    topic_norms = [
        {
            "id": str(topic_norm_id),
            "topic_id": str(topic_id),
            "jurabk": "BNatSchG",
            "paragraph_nr": "45",
        }
    ]
    context = ExaminationRechtsmethodikContext(
        gesetze=[
            {
                "id": str(existing_gesetz_id),
                "jurabk": "BNatSchG",
                "name": "Bundesnaturschutzgesetz",
                "frontend_parent_ids": [f"topic:{topic_id}"],
            }
        ],
    )

    inserts, updates, gesetz_id, norm_id = _build_inserts_and_updates(
        project_id=project_id,
        norm_result=norm_result,
        context=context,
        topic_norms=topic_norms,
    )

    assert [i["node_type"] for i in inserts] == ["norm"]
    assert inserts[0]["payload"]["gesetz_id"] == str(existing_gesetz_id)
    assert inserts[0]["payload"]["frontend_parent_ids"] == [f"topic_norm:{topic_norm_id}"]
    assert gesetz_id == existing_gesetz_id
    assert norm_id != existing_gesetz_id
    assert updates == []


def test_build_inserts_skips_when_nothing_to_change() -> None:
    project_id = uuid4()
    topic_id = UUID("00000000-0000-0000-0000-000000000001")
    topic_norm_id = UUID("00000000-0000-0000-0000-000000000011")
    existing_gesetz_id = uuid4()
    existing_norm_id = uuid4()

    topic_norms = [
        {
            "id": str(topic_norm_id),
            "topic_id": str(topic_id),
            "jurabk": "BNatSchG",
            "paragraph_nr": "44",
        }
    ]
    context = ExaminationRechtsmethodikContext(
        gesetze=[
            {
                "id": str(existing_gesetz_id),
                "jurabk": "BNatSchG",
                "name": "Bundesnaturschutzgesetz",
                "frontend_parent_ids": [f"topic:{topic_id}"],
            }
        ],
        norms=[
            {
                "id": str(existing_norm_id),
                "gesetz_id": str(existing_gesetz_id),
                "paragraph_nr": "§ 44",
                "frontend_parent_ids": [f"topic_norm:{topic_norm_id}"],
            }
        ],
    )

    inserts, updates, gesetz_id, norm_id = _build_inserts_and_updates(
        project_id=project_id,
        norm_result=_norm_result_minimal(),
        context=context,
        topic_norms=topic_norms,
    )

    assert inserts == []
    assert updates == []
    assert gesetz_id == existing_gesetz_id
    assert norm_id == existing_norm_id


def test_build_inserts_skips_satz_when_content_key_already_exists() -> None:
    """If a satz with the same (absatz_id, satz_nr, markers) already exists,
    it must not be re-inserted — even though the workflow.uuid4() generation
    would otherwise produce a new PK."""
    project_id = uuid4()
    topic_id = UUID("00000000-0000-0000-0000-000000000001")
    topic_norm_id = UUID("00000000-0000-0000-0000-000000000011")
    existing_gesetz_id = uuid4()
    existing_norm_id = uuid4()
    existing_absatz_id = uuid4()
    existing_satz_id = uuid4()

    norm_result = RechtsmethodikWorkflowOutput(
        gesetz="Bundesnaturschutzgesetz",
        jurabk="BNatSchG",
        standangaben=[],
        paragraph_nr="§ 44",
        paragraph_titel="Titel",
        paragraph_text="Normtext",
        absaetze=[
            Absatz(
                absatz_nr="1",
                absatz_text="Absatztext",
                saetze=[
                    RechtsmethodikWorkflowSatzOutput(
                        id=uuid4(),
                        satz_nr="1",
                        markers=["a"],
                        satz_text="Satztext",
                        norm_typ_lvl_1="materiell-rechtlich",
                    )
                ],
            )
        ],
        regelungsgegenstand=None,
    )
    topic_norms = [
        {
            "id": str(topic_norm_id),
            "topic_id": str(topic_id),
            "jurabk": "BNatSchG",
            "paragraph_nr": "44",
        }
    ]
    context = ExaminationRechtsmethodikContext(
        gesetze=[
            {
                "id": str(existing_gesetz_id),
                "jurabk": "BNatSchG",
                "name": "Bundesnaturschutzgesetz",
                "frontend_parent_ids": [f"topic:{topic_id}"],
            }
        ],
        norms=[
            {
                "id": str(existing_norm_id),
                "gesetz_id": str(existing_gesetz_id),
                "paragraph_nr": "§ 44",
                "frontend_parent_ids": [f"topic_norm:{topic_norm_id}"],
            }
        ],
        absaetze=[
            {
                "id": str(existing_absatz_id),
                "norm_id": str(existing_norm_id),
                "absatz_nr": "1",
                "text": "Absatztext",
            }
        ],
        saetze=[
            {
                "id": str(existing_satz_id),
                "absatz_id": str(existing_absatz_id),
                "satz_nr": "1",
                "markers": ["a"],
                "text": "Satztext",
            }
        ],
    )

    inserts, updates, _, _ = _build_inserts_and_updates(
        project_id=project_id,
        norm_result=norm_result,
        context=context,
        topic_norms=topic_norms,
    )

    assert inserts == []
    assert updates == []


def test_build_inserts_generates_satz_subtree_when_only_absatz_exists() -> None:
    project_id = uuid4()
    topic_id = UUID("00000000-0000-0000-0000-000000000001")
    topic_norm_id = UUID("00000000-0000-0000-0000-000000000011")
    existing_gesetz_id = uuid4()
    existing_norm_id = uuid4()
    existing_absatz_id = uuid4()

    norm_result = RechtsmethodikWorkflowOutput(
        gesetz="Bundesnaturschutzgesetz",
        jurabk="BNatSchG",
        standangaben=[],
        paragraph_nr="§ 44",
        paragraph_titel="Titel",
        paragraph_text="Normtext",
        absaetze=[
            Absatz(
                absatz_nr="1",
                absatz_text="Absatztext",
                saetze=[
                    RechtsmethodikWorkflowSatzOutput(
                        id=uuid4(),
                        satz_nr="1",
                        markers=[],
                        satz_text="Satztext",
                        norm_typ_lvl_1="materiell-rechtlich",
                        rechtsfolge=Rechtsfolge(
                            text="RF",
                            sollensanordnungen="verbot",
                            rechtsfolgen_adressat="handlungsermächtigung",
                        ),
                    )
                ],
            )
        ],
        regelungsgegenstand=None,
    )
    topic_norms = [
        {
            "id": str(topic_norm_id),
            "topic_id": str(topic_id),
            "jurabk": "BNatSchG",
            "paragraph_nr": "44",
        }
    ]
    context = ExaminationRechtsmethodikContext(
        gesetze=[
            {
                "id": str(existing_gesetz_id),
                "jurabk": "BNatSchG",
                "name": "Bundesnaturschutzgesetz",
                "frontend_parent_ids": [f"topic:{topic_id}"],
            }
        ],
        norms=[
            {
                "id": str(existing_norm_id),
                "gesetz_id": str(existing_gesetz_id),
                "paragraph_nr": "§ 44",
                "frontend_parent_ids": [f"topic_norm:{topic_norm_id}"],
            }
        ],
        absaetze=[
            {
                "id": str(existing_absatz_id),
                "norm_id": str(existing_norm_id),
                "absatz_nr": "1",
                "text": "Absatztext",
            }
        ],
        saetze=[],
    )

    inserts, updates, _, _ = _build_inserts_and_updates(
        project_id=project_id,
        norm_result=norm_result,
        context=context,
        topic_norms=topic_norms,
    )

    node_types = [i["node_type"] for i in inserts]
    assert "absatz" not in node_types  # absatz exists, satz did not
    assert "satz" in node_types
    assert "rechtsfolge" in node_types
    assert updates == []
    satz_insert = next(i for i in inserts if i["node_type"] == "satz")
    assert satz_insert["payload"]["position"] == 0

    # All insert IDs are globally fresh (never equal to existing parent IDs).
    existing_ids = {
        str(existing_gesetz_id),
        str(existing_norm_id),
        str(existing_absatz_id),
    }
    assert all(i["id"] not in existing_ids for i in inserts)
    assert len({i["id"] for i in inserts}) == len(inserts)


def test_build_inserts_assigns_satz_positions_from_absatz_order() -> None:
    project_id = uuid4()
    topic_id = UUID("00000000-0000-0000-0000-000000000001")
    topic_norm_id = UUID("00000000-0000-0000-0000-000000000011")

    norm_result = RechtsmethodikWorkflowOutput(
        gesetz="Bundesnaturschutzgesetz",
        jurabk="BNatSchG",
        standangaben=[],
        paragraph_nr="§ 44",
        paragraph_titel="Titel",
        paragraph_text="Normtext",
        absaetze=[
            Absatz(
                absatz_nr="1",
                absatz_text="Absatztext",
                saetze=[
                    RechtsmethodikWorkflowSatzOutput(
                        id=uuid4(),
                        satz_nr="1",
                        markers=[],
                        satz_text="Satz eins",
                        norm_typ_lvl_1="materiell-rechtlich",
                    ),
                    RechtsmethodikWorkflowSatzOutput(
                        id=uuid4(),
                        satz_nr="2",
                        markers=[],
                        satz_text="Satz zwei",
                        norm_typ_lvl_1="materiell-rechtlich",
                    ),
                    RechtsmethodikWorkflowSatzOutput(
                        id=uuid4(),
                        satz_nr="2",
                        markers=["lit. a"],
                        satz_text="Satz zwei marker",
                        norm_typ_lvl_1="materiell-rechtlich",
                    ),
                ],
            )
        ],
        regelungsgegenstand=None,
    )
    topic_norms = [
        {
            "id": str(topic_norm_id),
            "topic_id": str(topic_id),
            "jurabk": "BNatSchG",
            "paragraph_nr": "44",
        }
    ]

    inserts, updates, _, _ = _build_inserts_and_updates(
        project_id=project_id,
        norm_result=norm_result,
        context=ExaminationRechtsmethodikContext(),
        topic_norms=topic_norms,
    )

    satz_inserts = [i for i in inserts if i["node_type"] == "satz"]
    assert [insert["payload"]["position"] for insert in satz_inserts] == [0, 1, 2]
    assert [insert["payload"]["satz_nr"] for insert in satz_inserts] == ["1", "2", "2"]
    assert satz_inserts[2]["payload"]["markers"] == ["lit. a"]
    assert updates == []


def test_build_inserts_raises_when_no_topic_norm_match() -> None:
    project_id = uuid4()
    with pytest.raises(ApplicationError):
        _build_inserts_and_updates(
            project_id=project_id,
            norm_result=_norm_result_minimal(),
            context=ExaminationRechtsmethodikContext(),
            topic_norms=[],
        )


@pytest.mark.asyncio
async def test_insert_rechtsmethodik_result_skips_when_payload_is_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When the workflow found no inserts or updates, the write activity is a no-op."""
    project_id = uuid4()
    gesetz_id = UUID("00000000-0000-0000-0000-000000000101")
    norm_id = UUID("00000000-0000-0000-0000-000000000102")
    update_nodes = AsyncMock()
    monkeypatch.setattr(
        "src.workflows.insert_rechtsmethodik_results.activity.ExaminationServiceClient.update_nodes",
        update_nodes,
    )

    result = await _insert_rechtsmethodik_result(
        WriteRechtsmethodikResultInput(
            project_id=project_id,
            inserts=[],
            updates=[],
            gesetz_id=gesetz_id,
            norm_id=norm_id,
        )
    )

    assert isinstance(result, InsertRechtsmethodikResultOutput)
    assert result.skipped is True
    assert result.nodes_inserted == 0
    assert result.gesetz_id == gesetz_id
    assert result.norm_id == norm_id
    update_nodes.assert_not_awaited()


@pytest.mark.asyncio
async def test_insert_rechtsmethodik_result_posts_prebuilt_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    gesetz_id = UUID("00000000-0000-0000-0000-000000000101")
    norm_id = UUID("00000000-0000-0000-0000-000000000102")
    inserts = [
        {"node_type": "gesetz", "id": str(gesetz_id), "payload": {"jurabk": "BNatSchG"}},
        {"node_type": "norm", "id": str(norm_id), "payload": {"gesetz_id": str(gesetz_id), "paragraph_nr": "§ 44"}},
    ]
    update_nodes = AsyncMock(return_value={"inserted": [{}, {}], "updated": []})
    monkeypatch.setattr(
        "src.workflows.insert_rechtsmethodik_results.activity.ExaminationServiceClient.update_nodes",
        update_nodes,
    )

    result = await _insert_rechtsmethodik_result(
        WriteRechtsmethodikResultInput(
            project_id=project_id,
            inserts=inserts,
            updates=[],
            gesetz_id=gesetz_id,
            norm_id=norm_id,
        )
    )

    assert result.skipped is False
    assert result.nodes_inserted == EXPECTED_NODES_INSERTED
    update_nodes.assert_awaited_once()
    assert update_nodes.await_args is not None
    call_kwargs = update_nodes.await_args.kwargs
    assert call_kwargs["inserts"] == inserts
    assert call_kwargs["updates"] == []
