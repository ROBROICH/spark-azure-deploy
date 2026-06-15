from uuid import UUID

from temporal.workflows.project_versioning.types import FileDiffEntry

from src.services.workflows.create_project_version import (
    DOCUMENT_MANAGEMENT_SERVICE,
    EXAMINATION_SERVICE,
    PROJECT_LOGIC_SERVICE,
    NodeSummary,
    ParentRef,
    _file_roots,
    _topic_norm_revision_requests,
    build_copy_nodes_by_service,
    collect_dependents,
)

FILE_ID = UUID("00000000-0000-0000-0000-000000000001")
DOC_ID = UUID("00000000-0000-0000-0000-000000000002")
FUNDSTELLE_ID = UUID("00000000-0000-0000-0000-000000000003")
BEWERTUNG_ID = UUID("00000000-0000-0000-0000-000000000004")
TOPIC_ID = UUID("00000000-0000-0000-0000-000000000005")
TOPIC_NORM_ID = UUID("00000000-0000-0000-0000-000000000006")
NORM_ID = UUID("00000000-0000-0000-0000-000000000007")
SATZ_ID = UUID("00000000-0000-0000-0000-000000000008")


def test_changed_file_marks_ai_result_nodes_and_topic_norm_revision() -> None:
    summaries = [
        NodeSummary(DOCUMENT_MANAGEMENT_SERVICE, FILE_ID, "file"),
        NodeSummary(
            EXAMINATION_SERVICE,
            DOC_ID,
            "dokument",
            parents=(ParentRef(DOCUMENT_MANAGEMENT_SERVICE, "file", FILE_ID),),
            frontend_parent_ids=(f"topic:{TOPIC_ID}",),
        ),
        NodeSummary(
            EXAMINATION_SERVICE,
            NORM_ID,
            "norm",
            frontend_parent_ids=(f"topic_norm:{TOPIC_NORM_ID}",),
        ),
        NodeSummary(
            EXAMINATION_SERVICE,
            FUNDSTELLE_ID,
            "fundstelle",
            parents=(
                ParentRef(EXAMINATION_SERVICE, "dokument", DOC_ID),
                ParentRef(EXAMINATION_SERVICE, "norm", NORM_ID),
                ParentRef(EXAMINATION_SERVICE, "satz", SATZ_ID),
            ),
        ),
        NodeSummary(
            EXAMINATION_SERVICE,
            BEWERTUNG_ID,
            "bewertung",
            parents=(ParentRef(EXAMINATION_SERVICE, "satz", SATZ_ID),),
        ),
        NodeSummary(
            PROJECT_LOGIC_SERVICE,
            TOPIC_NORM_ID,
            "topic_norm",
            parents=(ParentRef(PROJECT_LOGIC_SERVICE, "topic", TOPIC_ID),),
        ),
    ]
    changed_keys = collect_dependents(roots=_file_roots({FILE_ID}), summaries=summaries)
    revision_requests = _topic_norm_revision_requests(summaries, changed_keys)

    nodes_by_service = build_copy_nodes_by_service(
        summaries=summaries,
        deleted_keys=set(),
        changed_keys=changed_keys,
        renamed_file_names={},
        topic_norm_payloads_by_id={
            TOPIC_NORM_ID: {
                "id": str(TOPIC_NORM_ID),
                "mvp_status": "checked",
                "satz_statuses": {str(SATZ_ID): "checked"},
            }
        },
        topic_norm_revision_requests=revision_requests,
    )

    examination_nodes = {node["node_type"]: node for node in nodes_by_service[EXAMINATION_SERVICE]}
    assert examination_nodes["dokument"]["set_outdated"] is True
    assert examination_nodes["fundstelle"]["set_outdated"] is True
    assert examination_nodes["bewertung"]["set_outdated"] is True

    topic_norm_node = nodes_by_service[PROJECT_LOGIC_SERVICE][0]
    assert topic_norm_node["overrides"] == {
        "mvp_status": "needs_revision",
        "satz_statuses": {str(SATZ_ID): "needs_revision"},
    }


def test_deleted_file_dependents_are_not_copied() -> None:
    summaries = [
        NodeSummary(DOCUMENT_MANAGEMENT_SERVICE, FILE_ID, "file"),
        NodeSummary(
            EXAMINATION_SERVICE,
            DOC_ID,
            "dokument",
            parents=(ParentRef(DOCUMENT_MANAGEMENT_SERVICE, "file", FILE_ID),),
        ),
    ]
    deleted_keys = collect_dependents(roots=_file_roots({FILE_ID}), summaries=summaries)

    nodes_by_service = build_copy_nodes_by_service(
        summaries=summaries,
        deleted_keys=deleted_keys,
        changed_keys=set(),
        renamed_file_names={},
        topic_norm_payloads_by_id={},
        topic_norm_revision_requests=_topic_norm_revision_requests(summaries, set()),
    )

    assert nodes_by_service == {}


def test_deleted_file_marks_topic_norm_revision_without_copying_document() -> None:
    summaries = [
        NodeSummary(DOCUMENT_MANAGEMENT_SERVICE, FILE_ID, "file"),
        NodeSummary(
            EXAMINATION_SERVICE,
            DOC_ID,
            "dokument",
            parents=(ParentRef(DOCUMENT_MANAGEMENT_SERVICE, "file", FILE_ID),),
            frontend_parent_ids=(f"topic:{TOPIC_ID}",),
        ),
        NodeSummary(
            PROJECT_LOGIC_SERVICE,
            TOPIC_NORM_ID,
            "topic_norm",
            parents=(ParentRef(PROJECT_LOGIC_SERVICE, "topic", TOPIC_ID),),
        ),
    ]
    deleted_keys = collect_dependents(roots=_file_roots({FILE_ID}), summaries=summaries)
    revision_requests = _topic_norm_revision_requests(summaries, deleted_keys)

    nodes_by_service = build_copy_nodes_by_service(
        summaries=summaries,
        deleted_keys=deleted_keys,
        changed_keys=set(),
        renamed_file_names={},
        topic_norm_payloads_by_id={
            TOPIC_NORM_ID: {
                "id": str(TOPIC_NORM_ID),
                "mvp_status": "checked",
            }
        },
        topic_norm_revision_requests=revision_requests,
    )

    examination_nodes = nodes_by_service.get(EXAMINATION_SERVICE, [])
    assert all(node["node_type"] != "dokument" for node in examination_nodes)

    topic_norm_node = nodes_by_service[PROJECT_LOGIC_SERVICE][0]
    assert topic_norm_node["overrides"] == {"mvp_status": "needs_revision"}


def test_renamed_file_patches_copied_document_filename_without_outdated() -> None:
    summaries = [
        NodeSummary(DOCUMENT_MANAGEMENT_SERVICE, FILE_ID, "file"),
        NodeSummary(
            EXAMINATION_SERVICE,
            DOC_ID,
            "dokument",
            parents=(ParentRef(DOCUMENT_MANAGEMENT_SERVICE, "file", FILE_ID),),
        ),
    ]

    nodes_by_service = build_copy_nodes_by_service(
        summaries=summaries,
        deleted_keys=set(),
        changed_keys=set(),
        renamed_file_names={FILE_ID: "renamed.pdf"},
        topic_norm_payloads_by_id={},
        topic_norm_revision_requests=_topic_norm_revision_requests(summaries, set()),
    )

    assert nodes_by_service[EXAMINATION_SERVICE] == [
        {
            "node_type": "dokument",
            "id": str(DOC_ID),
            "overrides": {"filename": "renamed.pdf"},
        }
    ]


def test_file_diff_entry_uses_new_name_as_target_filename() -> None:
    entry = FileDiffEntry(file_id=str(FILE_ID), old_name="old.pdf", new_name="new.pdf")
    assert entry.target_filename == "new.pdf"
