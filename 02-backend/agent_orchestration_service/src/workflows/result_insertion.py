from typing import Any

from src.services.api_clients import ExaminationServiceClient


def node_ref(node_type: str, node_id: str) -> dict[str, str]:
    return {"node_type": node_type, "id": node_id}


async def fetch_existing_nodes(
    project_id: Any,
    refs: list[dict[str, str]],
) -> list[dict[str, Any]]:
    if not refs:
        return []

    result = await ExaminationServiceClient.batch_get_nodes(project_id, refs)
    return result.get("results", [])


async def delete_stale_fundstellen_for_inserts(project_id: Any, inserts: list[dict[str, Any]]) -> int:
    """Delete outdated fundstelle nodes for the satz_ids being re-inserted.

    When a new project version is created the PLS copies existing fundstelle
    nodes and may mark them ``is_outdated=True`` if the underlying document
    changed.  Before inserting fresh results we remove those stale copies so
    that only the newly computed fundstellen remain.
    """
    target_satz_ids = {str(ins["payload"]["satz_id"]) for ins in inserts if ins.get("payload", {}).get("satz_id")}
    if not target_satz_ids:
        return 0

    graph = await ExaminationServiceClient.list_nodes(project_id)
    all_nodes = graph.get("nodes", [])

    outdated_fundstelle_refs = [
        node_ref("fundstelle", str(node["id"]))
        for node in all_nodes
        if node.get("node_type") == "fundstelle" and node.get("is_outdated")
    ]
    if not outdated_fundstelle_refs:
        return 0

    outdated_fundstellen = await fetch_existing_nodes(project_id, outdated_fundstelle_refs)
    matching = [f for f in outdated_fundstellen if str(f.get("satz_id")) in target_satz_ids]
    if not matching:
        return 0

    deletes = [node_ref("fundstelle", str(f["id"])) for f in matching]
    await ExaminationServiceClient.update_nodes(project_id, inserts=[], deletes=deletes)
    return len(deletes)


BEWERTUNG_DEPENDENT_NODE_TYPES = frozenset({"bewertung_kapitel", "bewertung_quelle"})


async def delete_stale_bewertungen_for_satz(project_id: Any, satz_id: str) -> int:
    """Delete outdated bewertung nodes (and their children) for a given satz.

    When a new project version is created the PLS copies existing bewertung nodes
    and marks them ``is_outdated=True`` if the underlying Satz changed.  Before
    inserting fresh results we must remove those stale copies so that only the
    newly computed bewertung remains.
    """
    graph = await ExaminationServiceClient.list_nodes(project_id)
    all_nodes = graph.get("nodes", [])

    # 1. Find bewertung nodes marked as outdated
    outdated_bewertung_refs = [
        node_ref("bewertung", str(node["id"]))
        for node in all_nodes
        if node.get("node_type") == "bewertung" and node.get("is_outdated")
    ]
    if not outdated_bewertung_refs:
        return 0

    # 2. Fetch full payloads to filter by satz_id
    outdated_bewertungen = await fetch_existing_nodes(project_id, outdated_bewertung_refs)
    matching = [b for b in outdated_bewertungen if str(b.get("satz_id")) == satz_id]
    if not matching:
        return 0

    # 3. Collect refs to delete: bewertung + markdown_text + children (kapitel, quelle)
    deletes: list[dict[str, str]] = []
    matching_bewertung_ids: set[str] = set()

    for bewertung in matching:
        bid = str(bewertung["id"])
        matching_bewertung_ids.add(bid)
        deletes.append(node_ref("bewertung", bid))

        markdown_text_id = bewertung.get("markdown_text_id")
        if markdown_text_id:
            deletes.append(node_ref("markdown_text", str(markdown_text_id)))

    # 4. Find child nodes (bewertung_kapitel, bewertung_quelle) via graph parents
    for node in all_nodes:
        if node.get("node_type") not in BEWERTUNG_DEPENDENT_NODE_TYPES:
            continue
        for parent in node.get("parents", []):
            if parent.get("node_type") == "bewertung" and str(parent.get("id")) in matching_bewertung_ids:
                deletes.append(node_ref(str(node["node_type"]), str(node["id"])))
                break

    if not deletes:
        return 0

    await ExaminationServiceClient.update_nodes(project_id, inserts=[], deletes=deletes)
    return len(deletes)


async def insert_nodes_idempotent(
    project_id: Any,
    inserts: list[dict[str, Any]],
) -> dict[str, Any]:
    """Write `inserts` only when the exact rows are not already committed.

    Pre-check: batch-fetch the expected `(node_type, id)` refs. If every
    expected row already exists, return those rows and skip the write. Otherwise
    call the write endpoint normally. Any `409` from a race between the
    pre-check and the write propagates so Temporal retries the activity — the
    next attempt's pre-check will see the committed rows.
    """
    if not inserts:
        return {"inserted": []}

    expected_refs = [node_ref(insert["node_type"], insert["id"]) for insert in inserts]
    existing = await fetch_existing_nodes(project_id, expected_refs)

    expected_keys = {(insert["node_type"], insert["id"]) for insert in inserts}
    existing_keys = {(str(node["node_type"]), str(node["id"])) for node in existing}

    if existing_keys == expected_keys:
        return {"inserted": existing}

    return await ExaminationServiceClient.update_nodes(project_id, inserts=inserts)
