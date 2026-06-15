"""Unit tests for version_diff_helpers — pure functions, no I/O."""

from uuid import UUID

from src.services.workflows.create_project_version import (
    NodeKey,
    NodeSummary,
    ParentRef,
    collect_dependents,
    decode_node_summaries,
)

# Convenience UUIDs
FILE_DEL = UUID("00000000-0000-0000-0000-000000000001")
FILE_CHG = UUID("00000000-0000-0000-0000-000000000002")
DOK_DEL = UUID("00000000-0000-0000-0000-0000000000a1")
DOK_CHG = UUID("00000000-0000-0000-0000-0000000000a2")
FUND_DEL = UUID("00000000-0000-0000-0000-0000000000b1")


def _summary(service, node_type, node_id, parents=()):
    return NodeSummary(
        service=service,
        id=node_id,
        node_type=node_type,
        parents=tuple(ParentRef(service=p[0], node_type=p[1], id=p[2]) for p in parents),
    )


def test_collect_dependents_walks_inverse_edges_transitively():
    summaries = [
        _summary(
            "examination_service",
            "dokument",
            DOK_DEL,
            parents=[("document_management_service", "file", FILE_DEL)],
        ),
        _summary(
            "examination_service",
            "fundstelle",
            FUND_DEL,
            parents=[("examination_service", "dokument", DOK_DEL)],
        ),
        # Untouched: a Dokument tied to a different file.
        _summary(
            "examination_service",
            "dokument",
            DOK_CHG,
            parents=[("document_management_service", "file", FILE_CHG)],
        ),
    ]
    roots = {NodeKey(service="document_management_service", node_type="file", id=FILE_DEL)}
    dependents = collect_dependents(roots=roots, summaries=summaries)

    assert NodeKey("examination_service", "dokument", DOK_DEL) in dependents
    assert NodeKey("examination_service", "fundstelle", FUND_DEL) in dependents
    assert NodeKey("examination_service", "dokument", DOK_CHG) not in dependents


def test_collect_dependents_handles_cycles_safely():
    # Pathological: a self-loop must not hang and must surface the node itself.
    looped_id = UUID("00000000-0000-0000-0000-0000000000ff")
    summaries = [
        _summary(
            "examination_service",
            "dokument",
            looped_id,
            parents=[("examination_service", "dokument", looped_id)],
        ),
    ]
    roots = {NodeKey("examination_service", "dokument", looped_id)}
    assert collect_dependents(roots=roots, summaries=summaries) == {
        NodeKey("examination_service", "dokument", looped_id)
    }


def test_collect_dependents_returns_empty_for_empty_roots():
    assert collect_dependents(roots=set(), summaries=[]) == set()


def test_decode_node_summaries_resolves_parent_service_from_listed_nodes():
    rows = [
        {
            "_service": "document_management_service",
            "id": str(FILE_DEL),
            "node_type": "file",
            "parents": [],
        },
        {
            "_service": "examination_service",
            "id": str(FUND_DEL),
            "node_type": "fundstelle",
            "parents": [],
        },
        {
            "_service": "examination_service",
            "id": str(DOK_DEL),
            "node_type": "dokument",
            "parents": [
                {
                    "id": str(FILE_DEL),
                    "node_type": "file",
                },
                {
                    "id": str(FUND_DEL),
                    "node_type": "fundstelle",
                },
            ],
        },
    ]

    summary = decode_node_summaries(rows)[2]

    assert summary.parents == (
        ParentRef(service="document_management_service", node_type="file", id=FILE_DEL),
        ParentRef(service="examination_service", node_type="fundstelle", id=FUND_DEL),
    )
