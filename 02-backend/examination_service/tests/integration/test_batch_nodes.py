from http import HTTPStatus

from httpx import AsyncClient
from syrupy.assertion import SnapshotAssertion

from tests.integration.conftest import gen_id, normalize, post_inserts


async def test_single_gesetz_payload(
    api_client: AsyncClient, project_id: str, ids: dict[str, str], snapshot_json: SnapshotAssertion
) -> None:
    gesetz_id = gen_id(ids, "<GESETZ>")
    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "gesetz", "id": gesetz_id, "payload": {"name": "Batch Gesetz", "jurabk": "BG"}},
        ],
    )

    resp = await api_client.post(
        f"/{project_id}/batch-nodes",
        json={"nodes": [{"node_type": "gesetz", "id": gesetz_id}]},
    )
    assert resp.status_code == HTTPStatus.OK
    assert normalize(resp.json(), ids) == snapshot_json


async def test_single_gesetz_payload_with_frontend_parent_ids(
    api_client: AsyncClient, project_id: str, ids: dict[str, str]
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
                    "name": "Batch Gesetz",
                    "jurabk": "BG",
                    "frontend_parent_ids": ["topic:aaa", "topic:bbb"],
                },
            },
        ],
    )

    resp = await api_client.post(
        f"/{project_id}/batch-nodes",
        json={"nodes": [{"node_type": "gesetz", "id": gesetz_id}]},
    )
    assert resp.status_code == HTTPStatus.OK

    result = resp.json()["results"][0]
    assert result["frontend_parent_ids"] == ["topic:aaa", "topic:bbb"]


async def test_norm_with_frontend_parent_ids(api_client: AsyncClient, project_id: str, ids: dict[str, str]) -> None:
    gesetz_id = gen_id(ids, "<GESETZ>")
    norm_id = gen_id(ids, "<NORM>")

    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "gesetz", "id": gesetz_id, "payload": {"name": "G", "jurabk": "G"}},
        ],
    )
    await post_inserts(
        api_client,
        project_id,
        [
            {
                "node_type": "norm",
                "id": norm_id,
                "payload": {
                    "gesetz_id": gesetz_id,
                    "paragraph_nr": "§ 1",
                    "text": "Norm text",
                    "frontend_parent_ids": ["topic_norm:xxx"],
                },
            },
        ],
    )

    resp = await api_client.post(
        f"/{project_id}/batch-nodes",
        json={"nodes": [{"node_type": "norm", "id": norm_id}]},
    )
    assert resp.status_code == HTTPStatus.OK

    result = resp.json()["results"][0]
    assert result["frontend_parent_ids"] == ["topic_norm:xxx"]


async def test_multi_type_batch(
    api_client: AsyncClient, project_id: str, ids: dict[str, str], snapshot_json: SnapshotAssertion
) -> None:
    gesetz_id = gen_id(ids, "<GESETZ>")
    norm_id = gen_id(ids, "<NORM>")

    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "gesetz", "id": gesetz_id, "payload": {"name": "Multi Gesetz", "jurabk": "MG"}},
        ],
    )
    await post_inserts(
        api_client,
        project_id,
        [
            {
                "node_type": "norm",
                "id": norm_id,
                "payload": {
                    "gesetz_id": gesetz_id,
                    "paragraph_nr": "§ 1",
                    "text": "Norm text",
                },
            },
        ],
    )

    resp = await api_client.post(
        f"/{project_id}/batch-nodes",
        json={"nodes": [{"node_type": "gesetz", "id": gesetz_id}, {"node_type": "norm", "id": norm_id}]},
    )
    assert resp.status_code == HTTPStatus.OK
    assert normalize(resp.json(), ids) == snapshot_json


async def test_node_with_json_columns(
    api_client: AsyncClient, project_id: str, ids: dict[str, str], snapshot_json: SnapshotAssertion
) -> None:
    gesetz_id = gen_id(ids, "<GESETZ>")
    norm_id = gen_id(ids, "<NORM>")
    absatz_id = gen_id(ids, "<ABSATZ>")
    satz_id = gen_id(ids, "<SATZ>")

    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "gesetz", "id": gesetz_id, "payload": {"name": "JSON Gesetz", "jurabk": "JG"}},
        ],
    )
    await post_inserts(
        api_client,
        project_id,
        [
            {
                "node_type": "norm",
                "id": norm_id,
                "payload": {
                    "gesetz_id": gesetz_id,
                    "paragraph_nr": "§ 1",
                    "text": "Norm",
                },
            },
        ],
    )
    await post_inserts(
        api_client,
        project_id,
        [
            {
                "node_type": "absatz",
                "id": absatz_id,
                "payload": {"norm_id": norm_id, "absatz_nr": "1", "text": "Absatz"},
            },
        ],
    )
    await post_inserts(
        api_client,
        project_id,
        [
            {
                "node_type": "satz",
                "id": satz_id,
                "payload": {
                    "absatz_id": absatz_id,
                    "satz_nr": "1",
                    "position": 0,
                    "text": "Satz with markers",
                    "markers": ["lit. a", "Nr. 1"],
                    "tatbestandsmerkmale": ["tbm1", "tbm2"],
                    "norm_typ_lvl_1": "Gebot",
                    "norm_typ_lvl_2": "Handlungsgebot",
                },
            },
        ],
    )

    resp = await api_client.post(
        f"/{project_id}/batch-nodes",
        json={"nodes": [{"node_type": "satz", "id": satz_id}]},
    )
    assert resp.status_code == HTTPStatus.OK
    assert normalize(resp.json(), ids) == snapshot_json


async def test_empty_batch(api_client: AsyncClient, project_id: str) -> None:
    """Empty nodes list should return empty results."""
    resp = await api_client.post(
        f"/{project_id}/batch-nodes",
        json={"nodes": []},
    )
    assert resp.status_code == HTTPStatus.OK
    data = resp.json()
    assert data["results"] == []


async def test_nonexistent_ids(api_client: AsyncClient, project_id: str, ids: dict[str, str]) -> None:
    """Requesting IDs that don't exist should return empty results."""
    fake_id = gen_id(ids, "<FAKE>")
    resp = await api_client.post(
        f"/{project_id}/batch-nodes",
        json={"nodes": [{"node_type": "gesetz", "id": fake_id}]},
    )
    assert resp.status_code == HTTPStatus.OK
    assert resp.json()["results"] == []


async def test_deleted_node_excluded(
    api_client: AsyncClient, project_id: str, ids: dict[str, str], snapshot_json: SnapshotAssertion
) -> None:
    gesetz_id = gen_id(ids, "<GESETZ>")
    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "gesetz", "id": gesetz_id, "payload": {"name": "Del Gesetz", "jurabk": "DG"}},
        ],
    )

    # Soft-delete
    resp = await api_client.post(
        f"/{project_id}/update",
        json={"inserts": [], "updates": [], "deletes": [{"node_type": "gesetz", "id": gesetz_id}]},
    )
    resp.raise_for_status()

    resp = await api_client.post(
        f"/{project_id}/batch-nodes",
        json={"nodes": [{"node_type": "gesetz", "id": gesetz_id}]},
    )
    assert resp.status_code == HTTPStatus.OK
    assert normalize(resp.json(), ids) == snapshot_json
