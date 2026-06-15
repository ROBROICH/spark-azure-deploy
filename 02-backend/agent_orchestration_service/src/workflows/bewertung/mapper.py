"""Pure mapping functions from BewertungsWorkflowOutput to examination service insert payloads.

Must be called from workflow context — uses ``workflow.uuid4()`` for stable IDs.
"""

from typing import Any
from uuid import UUID

from temporal.workflows.bewertung.types import BewertungsWorkflowOutput
from temporalio import workflow


def _insert(node_type: str, node_id: str | UUID, payload: dict[str, Any]) -> dict[str, Any]:
    return {"node_type": node_type, "id": str(node_id), "payload": payload}


def map_bewertung_result(
    output: BewertungsWorkflowOutput,
    satz_id: str,
) -> tuple[str, list[dict[str, Any]]]:
    """Map a single Satz bewertung output to graph node inserts.

    Returns (bewertung_id, inserts_list).
    """
    inserts: list[dict[str, Any]] = []
    bewertung_id = str(output.id)

    markdown_text_id = str(workflow.uuid4())
    inserts.append(
        _insert(
            "markdown_text",
            markdown_text_id,
            {"text": output.full_text},
        )
    )

    inserts.append(
        _insert(
            "bewertung",
            bewertung_id,
            {
                "satz_id": satz_id,
                "result": output.result,
                "kurzform": output.kurzform,
                "norm": output.norm,
                "markdown_text_id": markdown_text_id,
            },
        )
    )

    for index, k in enumerate(output.kapitel):
        inserts.append(
            _insert(
                "bewertung_kapitel",
                k.id,
                {
                    "bewertung_id": bewertung_id,
                    "titel": k.titel,
                    "markdown": k.markdown,
                    "kurzform": k.kurzform,
                    "order": index,
                },
            )
        )

    for _source_id, q in sorted(output.sources.items()):
        inserts.append(
            _insert(
                "bewertung_quelle",
                str(workflow.uuid4()),
                {
                    "bewertung_id": bewertung_id,
                    "dokument_id": q.document_id,
                    "fundstelle_id": q.node_id or None,
                    "title": q.title,
                    "cited_svm_id": _source_id,
                    "chunk_ids": q.chunk_ids,
                    "page_numbers": q.page_numbers,
                },
            )
        )

    return bewertung_id, inserts
