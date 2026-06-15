"""Pure mapping functions to Fundstelle insert payloads.

Must be called from workflow context — uses ``workflow.uuid4()`` for stable IDs.
"""

from typing import Any

from temporal.workflows.modul_suche_und_zuordnung.types import (
    PageIndexSVMEntry,
)
from temporalio import workflow


def _insert(node_type: str, node_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    return {"node_type": node_type, "id": node_id, "payload": payload}


def map_fundstellen(
    originaltexte: list[PageIndexSVMEntry],
    chunk_to_dokument: dict[str, str],
    dms_to_dokument: dict[str, str],
    satz_id: str,
    gesetz_id: str,
    norm_id: str,
) -> list[dict[str, Any]]:
    """Map originaltexte entries to Fundstelle insert payloads."""
    inserts: list[dict[str, Any]] = []

    for entry in originaltexte:
        chunk_ids = entry.chunk_ids
        frontend_parent_ids = [f"chunk:{cid}" for cid in chunk_ids if cid]

        dokument_id = None
        for cid in entry.chunk_ids:
            if cid and cid in chunk_to_dokument:
                dokument_id = chunk_to_dokument[cid]
                break

        if not dokument_id:
            dokument_id = dms_to_dokument.get(str(entry.document_id))

        if not dokument_id:
            continue

        inserts.append(
            _insert(
                "fundstelle",
                str(workflow.uuid4()),
                {
                    "satz_id": satz_id,
                    "gesetz_id": gesetz_id,
                    "norm_id": norm_id,
                    "dokument_id": dokument_id,
                    "chunk_ids": [c for c in entry.chunk_ids if c],
                    "title": entry.title,
                    "text": entry.text,
                    "page_numbers": entry.page_numbers,
                    "frontend_parent_ids": frontend_parent_ids,
                },
            )
        )
    return inserts
