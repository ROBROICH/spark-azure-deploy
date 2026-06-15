from http import HTTPStatus

import httpx
from syrupy.assertion import SnapshotAssertion

from tests.integration.conftest import gen_id, normalize, post_inserts


async def test_insert_single_gesetz(
    api_client: httpx.AsyncClient,
    project_id: str,
    ids: dict[str, str],
    snapshot_json: SnapshotAssertion,
) -> None:
    gesetz_id = gen_id(ids, "<GESETZ>")
    resp = await api_client.post(
        f"/{project_id}/update",
        json={
            "inserts": [
                {"node_type": "gesetz", "id": gesetz_id, "payload": {"name": "Insert Gesetz", "jurabk": "IG"}},
            ],
            "updates": [],
            "deletes": [],
        },
    )
    assert resp.status_code == HTTPStatus.OK
    assert normalize(resp.json(), ids) == snapshot_json


async def test_insert_duplicate_gesetz_conflicts_within_project(
    api_client: httpx.AsyncClient,
    project_id: str,
    ids: dict[str, str],
) -> None:
    first_gesetz_id = gen_id(ids, "<GESETZ_1>")
    second_gesetz_id = gen_id(ids, "<GESETZ_2>")

    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "gesetz", "id": first_gesetz_id, "payload": {"name": "Gesetz 1", "jurabk": "BNatSchG"}},
        ],
    )

    resp = await api_client.post(
        f"/{project_id}/update",
        json={
            "inserts": [
                {"node_type": "gesetz", "id": second_gesetz_id, "payload": {"name": "Gesetz 2", "jurabk": "BNatSchG"}},
            ],
            "updates": [],
            "deletes": [],
        },
    )

    assert resp.status_code == HTTPStatus.CONFLICT


async def test_insert_same_gesetz_allowed_in_other_project(
    api_client: httpx.AsyncClient,
    project_id: str,
    ids: dict[str, str],
) -> None:
    first_gesetz_id = gen_id(ids, "<GESETZ_1>")
    second_gesetz_id = gen_id(ids, "<GESETZ_2>")
    other_project_id = gen_id(ids, "<PROJECT_2>")

    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "gesetz", "id": first_gesetz_id, "payload": {"name": "Gesetz 1", "jurabk": "BNatSchG"}},
        ],
    )
    await post_inserts(api_client, other_project_id, [{"node_type": "project", "id": other_project_id, "payload": {}}])

    resp = await api_client.post(
        f"/{other_project_id}/update",
        json={
            "inserts": [
                {"node_type": "gesetz", "id": second_gesetz_id, "payload": {"name": "Gesetz 2", "jurabk": "BNatSchG"}},
            ],
            "updates": [],
            "deletes": [],
        },
    )

    assert resp.status_code == HTTPStatus.OK


async def test_insert_with_children(
    api_client: httpx.AsyncClient,
    project_id: str,
    ids: dict[str, str],
    snapshot_json: SnapshotAssertion,
) -> None:
    gesetz_id = gen_id(ids, "<GESETZ>")
    norm_id = gen_id(ids, "<NORM>")

    # Insert gesetz first (FK ordering)
    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "gesetz", "id": gesetz_id, "payload": {"name": "Parent Gesetz", "jurabk": "PG"}},
        ],
    )

    # Insert norm referencing the gesetz
    resp = await api_client.post(
        f"/{project_id}/update",
        json={
            "inserts": [
                {
                    "node_type": "norm",
                    "id": norm_id,
                    "payload": {"gesetz_id": gesetz_id, "paragraph_nr": "§ 1", "text": "Child norm text"},
                },
            ],
            "updates": [],
            "deletes": [],
        },
    )
    assert resp.status_code == HTTPStatus.OK
    assert normalize(resp.json(), ids) == snapshot_json


async def test_insert_duplicate_norm_conflicts_on_exact_paragraph(
    api_client: httpx.AsyncClient,
    project_id: str,
    ids: dict[str, str],
) -> None:
    gesetz_id = gen_id(ids, "<GESETZ>")
    first_norm_id = gen_id(ids, "<NORM_1>")
    second_norm_id = gen_id(ids, "<NORM_2>")

    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "gesetz", "id": gesetz_id, "payload": {"name": "Parent Gesetz", "jurabk": "BNatSchG"}},
            {
                "node_type": "norm",
                "id": first_norm_id,
                "payload": {"gesetz_id": gesetz_id, "paragraph_nr": "§ 44", "text": "First norm"},
            },
        ],
    )

    resp = await api_client.post(
        f"/{project_id}/update",
        json={
            "inserts": [
                {
                    "node_type": "norm",
                    "id": second_norm_id,
                    "payload": {"gesetz_id": gesetz_id, "paragraph_nr": "§ 44", "text": "Second norm"},
                },
            ],
            "updates": [],
            "deletes": [],
        },
    )

    assert resp.status_code == HTTPStatus.CONFLICT


async def test_patch_single_field(
    api_client: httpx.AsyncClient,
    project_id: str,
    ids: dict[str, str],
    snapshot_json: SnapshotAssertion,
) -> None:
    gesetz_id = gen_id(ids, "<GESETZ>")
    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "gesetz", "id": gesetz_id, "payload": {"name": "Original Name", "jurabk": "ON"}},
        ],
    )

    resp = await api_client.post(
        f"/{project_id}/update",
        json={
            "inserts": [],
            "updates": [
                {"node_type": "gesetz", "id": gesetz_id, "payload": {"name": "Updated Name"}},
            ],
            "deletes": [],
        },
    )
    assert resp.status_code == HTTPStatus.OK
    assert normalize(resp.json(), ids) == snapshot_json


async def test_update_type_is_accepted_for_insert_and_update(
    api_client: httpx.AsyncClient,
    project_id: str,
    ids: dict[str, str],
) -> None:
    gesetz_id = gen_id(ids, "<GESETZ>")

    insert_resp = await api_client.post(
        f"/{project_id}/update",
        json={
            "inserts": [
                {
                    "node_type": "gesetz",
                    "id": gesetz_id,
                    "payload": {"name": "Manual Gesetz", "jurabk": "MG", "update_type": "manual"},
                },
            ],
            "updates": [],
            "deletes": [],
        },
    )
    assert insert_resp.status_code == HTTPStatus.OK
    assert insert_resp.json()["inserted"][0]["update_type"] == "manual"

    update_resp = await api_client.post(
        f"/{project_id}/update",
        json={
            "inserts": [],
            "updates": [
                {"node_type": "gesetz", "id": gesetz_id, "payload": {"update_type": "automated"}},
            ],
            "deletes": [],
        },
    )
    assert update_resp.status_code == HTTPStatus.OK
    assert update_resp.json()["updated"][0]["update_type"] == "automated"


async def test_delete_single_node(
    api_client: httpx.AsyncClient,
    project_id: str,
    ids: dict[str, str],
    snapshot_json: SnapshotAssertion,
) -> None:
    gesetz_id = gen_id(ids, "<GESETZ>")
    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "gesetz", "id": gesetz_id, "payload": {"name": "To Delete", "jurabk": "TD"}},
        ],
    )

    resp = await api_client.post(
        f"/{project_id}/update",
        json={
            "inserts": [],
            "updates": [],
            "deletes": [{"node_type": "gesetz", "id": gesetz_id}],
        },
    )
    assert resp.status_code == HTTPStatus.OK
    assert normalize(resp.json(), ids) == snapshot_json


async def test_mixed_operations(
    api_client: httpx.AsyncClient,
    project_id: str,
    ids: dict[str, str],
    snapshot_json: SnapshotAssertion,
) -> None:
    gesetz_to_update = gen_id(ids, "<GESETZ_UPDATE>")
    gesetz_to_delete = gen_id(ids, "<GESETZ_DELETE>")
    gesetz_to_insert = gen_id(ids, "<GESETZ_INSERT>")

    # Pre-create two gesetze for update and delete
    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "gesetz", "id": gesetz_to_update, "payload": {"name": "Will Update", "jurabk": "WU"}},
            {"node_type": "gesetz", "id": gesetz_to_delete, "payload": {"name": "Will Delete", "jurabk": "WD"}},
        ],
    )

    # All three operations in a single request
    resp = await api_client.post(
        f"/{project_id}/update",
        json={
            "inserts": [
                {
                    "node_type": "gesetz",
                    "id": gesetz_to_insert,
                    "payload": {"name": "Freshly Inserted", "jurabk": "FI"},
                },
            ],
            "updates": [
                {"node_type": "gesetz", "id": gesetz_to_update, "payload": {"name": "Now Updated"}},
            ],
            "deletes": [{"node_type": "gesetz", "id": gesetz_to_delete}],
        },
    )
    assert resp.status_code == HTTPStatus.OK
    assert normalize(resp.json(), ids) == snapshot_json


async def test_invalid_node_type(
    api_client: httpx.AsyncClient,
    project_id: str,
    ids: dict[str, str],
) -> None:
    resp = await api_client.post(
        f"/{project_id}/update",
        json={
            "inserts": [
                {"node_type": "nonexistent_type", "id": gen_id(ids, "<BAD>"), "payload": {"name": "X"}},
            ],
            "updates": [],
            "deletes": [],
        },
    )
    assert resp.status_code >= HTTPStatus.BAD_REQUEST


async def test_delete_already_deleted_node(
    api_client: httpx.AsyncClient,
    project_id: str,
    ids: dict[str, str],
) -> None:
    gesetz_id = gen_id(ids, "<GESETZ>")
    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "gesetz", "id": gesetz_id, "payload": {"name": "Will Delete Twice", "jurabk": "WD"}},
        ],
    )

    # First delete succeeds
    resp = await api_client.post(
        f"/{project_id}/update",
        json={"inserts": [], "updates": [], "deletes": [{"node_type": "gesetz", "id": gesetz_id}]},
    )
    assert resp.status_code == HTTPStatus.OK

    # Second delete should fail (node already soft-deleted)
    resp = await api_client.post(
        f"/{project_id}/update",
        json={"inserts": [], "updates": [], "deletes": [{"node_type": "gesetz", "id": gesetz_id}]},
    )
    assert resp.status_code >= HTTPStatus.BAD_REQUEST


async def test_empty_operations(api_client: httpx.AsyncClient, project_id: str) -> None:
    """Empty inserts/updates/deletes should succeed with empty results."""
    resp = await api_client.post(
        f"/{project_id}/update",
        json={"inserts": [], "updates": [], "deletes": []},
    )
    assert resp.status_code == HTTPStatus.OK
    data = resp.json()
    assert data["inserted"] == []
    assert data["updated"] == []
    assert data["deleted"] == []


async def test_insert_gesetz_with_frontend_parent_ids(
    api_client: httpx.AsyncClient,
    project_id: str,
    ids: dict[str, str],
) -> None:
    gesetz_id = gen_id(ids, "<GESETZ>")
    resp = await api_client.post(
        f"/{project_id}/update",
        json={
            "inserts": [
                {
                    "node_type": "gesetz",
                    "id": gesetz_id,
                    "payload": {
                        "name": "FP Gesetz",
                        "jurabk": "FPG",
                        "frontend_parent_ids": ["topic:aaa", "topic:bbb"],
                    },
                },
            ],
            "updates": [],
            "deletes": [],
        },
    )
    assert resp.status_code == HTTPStatus.OK
    inserted = resp.json()["inserted"]
    assert len(inserted) == 1
    assert inserted[0]["frontend_parent_ids"] == ["topic:aaa", "topic:bbb"]


async def test_insert_mixed_gesetz_frontend_parent_ids_defaults(
    api_client: httpx.AsyncClient,
    project_id: str,
    ids: dict[str, str],
) -> None:
    gesetz_a_id = gen_id(ids, "<GESETZ_A>")
    gesetz_b_id = gen_id(ids, "<GESETZ_B>")
    resp = await api_client.post(
        f"/{project_id}/update",
        json={
            "inserts": [
                {
                    "node_type": "gesetz",
                    "id": gesetz_a_id,
                    "payload": {
                        "name": "FP Gesetz A",
                        "jurabk": "FPGA",
                        "frontend_parent_ids": ["topic:aaa", "topic:bbb"],
                    },
                },
                {
                    "node_type": "gesetz",
                    "id": gesetz_b_id,
                    "payload": {
                        "name": "FP Gesetz B",
                        "jurabk": "FPGB",
                    },
                },
            ],
            "updates": [],
            "deletes": [],
        },
    )
    assert resp.status_code == HTTPStatus.OK
    inserted_by_id = {item["id"]: item for item in resp.json()["inserted"]}
    assert inserted_by_id[gesetz_a_id]["frontend_parent_ids"] == ["topic:aaa", "topic:bbb"]
    assert inserted_by_id[gesetz_b_id]["frontend_parent_ids"] == []


async def test_update_gesetz_frontend_parent_ids(
    api_client: httpx.AsyncClient,
    project_id: str,
    ids: dict[str, str],
) -> None:
    gesetz_id = gen_id(ids, "<GESETZ>")
    await post_inserts(
        api_client,
        project_id,
        [
            {
                "node_type": "gesetz",
                "id": gesetz_id,
                "payload": {
                    "name": "Merge Gesetz",
                    "jurabk": "MG",
                    "frontend_parent_ids": ["topic:aaa"],
                },
            },
        ],
    )

    resp = await api_client.post(
        f"/{project_id}/update",
        json={
            "inserts": [],
            "updates": [
                {
                    "node_type": "gesetz",
                    "id": gesetz_id,
                    "payload": {"frontend_parent_ids": ["topic:aaa", "topic:bbb"]},
                },
            ],
            "deletes": [],
        },
    )
    assert resp.status_code == HTTPStatus.OK
    updated = resp.json()["updated"]
    assert len(updated) == 1
    assert updated[0]["frontend_parent_ids"] == ["topic:aaa", "topic:bbb"]


async def test_insert_norm_with_frontend_parent_ids(
    api_client: httpx.AsyncClient,
    project_id: str,
    ids: dict[str, str],
) -> None:
    gesetz_id = gen_id(ids, "<GESETZ>")
    norm_id = gen_id(ids, "<NORM>")

    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "gesetz", "id": gesetz_id, "payload": {"name": "G", "jurabk": "G"}},
        ],
    )

    resp = await api_client.post(
        f"/{project_id}/update",
        json={
            "inserts": [
                {
                    "node_type": "norm",
                    "id": norm_id,
                    "payload": {
                        "gesetz_id": gesetz_id,
                        "paragraph_nr": "§ 1",
                        "text": "Norm text",
                        "frontend_parent_ids": ["topic_norm:xxx", "topic_norm:yyy"],
                    },
                },
            ],
            "updates": [],
            "deletes": [],
        },
    )
    assert resp.status_code == HTTPStatus.OK
    inserted = resp.json()["inserted"]
    assert len(inserted) == 1
    assert inserted[0]["frontend_parent_ids"] == ["topic_norm:xxx", "topic_norm:yyy"]


async def test_insert_multi_parent(
    api_client: httpx.AsyncClient,
    project_id: str,
    ids: dict[str, str],
    snapshot_json: SnapshotAssertion,
) -> None:
    markdown_text_id = gen_id(ids, "<MARKDOWN_TEXT>")
    dokument_id = gen_id(ids, "<DOKUMENT>")
    gesetz_id = gen_id(ids, "<GESETZ>")
    norm_id = gen_id(ids, "<NORM>")
    absatz_id = gen_id(ids, "<ABSATZ>")
    satz_id = gen_id(ids, "<SATZ>")
    chunk_id = gen_id(ids, "<CHUNK>")
    fundstelle_id = gen_id(ids, "<FUNDSTELLE>")

    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "markdown_text", "id": markdown_text_id, "payload": {"text": "# Test"}},
        ],
    )
    await post_inserts(
        api_client,
        project_id,
        [
            {
                "node_type": "dokument",
                "id": dokument_id,
                "payload": {
                    "dms_file_id": gen_id(ids, "<DMS_FILE>"),
                    "filename": "test.pdf",
                    "mime_type": "application/pdf",
                    "page_count": 10,
                    "summary": "Test document summary",
                    "markdown_text_id": markdown_text_id,
                },
            },
        ],
    )
    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "gesetz", "id": gesetz_id, "payload": {"name": "BNatSchG", "jurabk": "BNatSchG"}},
            {
                "node_type": "norm",
                "id": norm_id,
                "payload": {"gesetz_id": gesetz_id, "paragraph_nr": "§ 44", "text": "Norm text"},
            },
            {
                "node_type": "absatz",
                "id": absatz_id,
                "payload": {"norm_id": norm_id, "absatz_nr": "1", "text": "Absatz text"},
            },
            {
                "node_type": "satz",
                "id": satz_id,
                "payload": {"absatz_id": absatz_id, "satz_nr": "1", "text": "Satz text"},
            },
            {
                "node_type": "chunk",
                "id": chunk_id,
                "payload": {
                    "dokument_id": dokument_id,
                    "header": "Section 1",
                    "page_numbers": [1, 2],
                    "toc_path": ["Chapter 1", "Section 1"],
                    "all_subchapters": [],
                    "order": 0,
                },
            },
        ],
    )

    resp = await api_client.post(
        f"/{project_id}/update",
        json={
            "inserts": [
                {
                    "node_type": "fundstelle",
                    "id": fundstelle_id,
                    "payload": {
                        "satz_id": satz_id,
                        "dokument_id": dokument_id,
                        "gesetz_id": gesetz_id,
                        "norm_id": norm_id,
                        "title": "Fundstelle title",
                        "text": "Fundstelle text",
                        "page_numbers": [1, 2],
                        "chunk_ids": [chunk_id],
                    },
                },
            ],
            "updates": [],
            "deletes": [],
        },
    )
    assert resp.status_code == HTTPStatus.OK
    assert normalize(resp.json(), ids) == snapshot_json


async def test_insert_chunk_with_page_index_fields(
    api_client: httpx.AsyncClient,
    project_id: str,
    ids: dict[str, str],
) -> None:
    markdown_text_id = gen_id(ids, "<MARKDOWN>")
    dokument_id = gen_id(ids, "<DOKUMENT>")
    chunk_id = gen_id(ids, "<CHUNK>")

    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "markdown_text", "id": markdown_text_id, "payload": {"text": "# Test"}},
        ],
    )
    await post_inserts(
        api_client,
        project_id,
        [
            {
                "node_type": "dokument",
                "id": dokument_id,
                "payload": {
                    "dms_file_id": gen_id(ids, "<DMS_FILE>"),
                    "filename": "test.pdf",
                    "mime_type": "application/pdf",
                    "page_count": 10,
                    "summary": "Test document summary",
                    "markdown_text_id": markdown_text_id,
                },
            },
        ],
    )

    resp = await api_client.post(
        f"/{project_id}/update",
        json={
            "inserts": [
                {
                    "node_type": "chunk",
                    "id": chunk_id,
                    "payload": {
                        "dokument_id": dokument_id,
                        "header": "Section 1",
                        "page_numbers": [1, 2],
                        "toc_path": ["Chapter 1", "Section 1"],
                        "all_subchapters": [],
                        "order": 0,
                        "page_index_node_id": "node-0",
                        "page_index_position": 0,
                        "page_index_summary": "Section summary",
                    },
                },
            ],
            "updates": [],
            "deletes": [],
        },
    )

    assert resp.status_code == HTTPStatus.OK
    inserted = resp.json()["inserted"]
    assert len(inserted) == 1
    assert inserted[0]["page_index_node_id"] == "node-0"
    assert inserted[0]["page_index_position"] == 0
    assert inserted[0]["page_index_summary"] == "Section summary"
