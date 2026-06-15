from http import HTTPStatus

from httpx import AsyncClient
from syrupy.assertion import SnapshotAssertion

from tests.integration.conftest import gen_id, normalize, post_inserts


async def test_empty_project(
    api_client: AsyncClient, project_id: str, ids: dict[str, str], snapshot_json: SnapshotAssertion
) -> None:
    resp = await api_client.get(f"/{project_id}/nodes")
    assert resp.status_code == HTTPStatus.OK
    assert normalize(resp.json(), ids) == snapshot_json


async def test_single_gesetz(
    api_client: AsyncClient, project_id: str, ids: dict[str, str], snapshot_json: SnapshotAssertion
) -> None:
    gesetz_id = gen_id(ids, "<GESETZ>")
    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "gesetz", "id": gesetz_id, "payload": {"name": "Test Gesetz", "jurabk": "TestG"}},
        ],
    )

    resp = await api_client.get(f"/{project_id}/nodes")
    assert resp.status_code == HTTPStatus.OK
    assert normalize(resp.json(), ids) == snapshot_json


async def test_hierarchy_gesetz_norm_absatz(
    api_client: AsyncClient, project_id: str, ids: dict[str, str], snapshot_json: SnapshotAssertion
) -> None:
    gesetz_id = gen_id(ids, "<GESETZ>")
    norm_id = gen_id(ids, "<NORM>")
    absatz_id = gen_id(ids, "<ABSATZ>")

    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "gesetz", "id": gesetz_id, "payload": {"name": "Hierarchy Gesetz", "jurabk": "HG"}},
        ],
    )
    await post_inserts(
        api_client,
        project_id,
        [
            {
                "node_type": "norm",
                "id": norm_id,
                "payload": {"gesetz_id": gesetz_id, "paragraph_nr": "§ 1", "text": "Norm text"},
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
                "payload": {"norm_id": norm_id, "absatz_nr": "1", "text": "Absatz text"},
            },
        ],
    )

    resp = await api_client.get(f"/{project_id}/nodes")
    assert resp.status_code == HTTPStatus.OK
    assert normalize(resp.json(), ids) == snapshot_json


async def test_multi_parent_node(
    api_client: AsyncClient, project_id: str, ids: dict[str, str], snapshot_json: SnapshotAssertion
) -> None:
    gesetz_id = gen_id(ids, "<GESETZ>")
    norm_id = gen_id(ids, "<NORM>")
    absatz_id = gen_id(ids, "<ABSATZ>")
    satz_id = gen_id(ids, "<SATZ>")
    rechtsfolge_id = gen_id(ids, "<RECHTSFOLGE>")
    ev_id = gen_id(ids, "<EXPL_VERWEIS>")

    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "gesetz", "id": gesetz_id, "payload": {"name": "EV Gesetz", "jurabk": "EVG"}},
        ],
    )
    await post_inserts(
        api_client,
        project_id,
        [
            {
                "node_type": "norm",
                "id": norm_id,
                "payload": {"gesetz_id": gesetz_id, "paragraph_nr": "§ 1", "text": "Norm"},
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
            {"node_type": "satz", "id": satz_id, "payload": {"absatz_id": absatz_id, "satz_nr": "1", "text": "Satz"}},
        ],
    )
    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "rechtsfolge", "id": rechtsfolge_id, "payload": {"satz_id": satz_id, "text": "RF"}},
        ],
    )
    await post_inserts(
        api_client,
        project_id,
        [
            {
                "node_type": "expliziter_verweis",
                "id": ev_id,
                "payload": {"rechtsfolge_id": rechtsfolge_id, "gesetz": "BNatSchG", "paragraph_nr": "§ 44"},
            },
        ],
    )

    resp = await api_client.get(f"/{project_id}/nodes")
    assert resp.status_code == HTTPStatus.OK
    assert normalize(resp.json(), ids) == snapshot_json


async def test_soft_deleted_excluded(
    api_client: AsyncClient, project_id: str, ids: dict[str, str], snapshot_json: SnapshotAssertion
) -> None:
    gesetz_id = gen_id(ids, "<GESETZ>")
    await post_inserts(
        api_client,
        project_id,
        [
            {"node_type": "gesetz", "id": gesetz_id, "payload": {"name": "Deleted Gesetz", "jurabk": "DG"}},
        ],
    )

    # Soft-delete the gesetz
    resp = await api_client.post(
        f"/{project_id}/update",
        json={"inserts": [], "updates": [], "deletes": [{"node_type": "gesetz", "id": gesetz_id}]},
    )
    resp.raise_for_status()

    resp = await api_client.get(f"/{project_id}/nodes")
    assert resp.status_code == HTTPStatus.OK
    assert normalize(resp.json(), ids) == snapshot_json
