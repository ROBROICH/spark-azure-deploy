from typing import Any

from temporal.workflows.modul_suche_und_zuordnung.types import NormData

from src.config import CONFIG
from src.satz_orchestrator_helpers import _find_satz_context
from src.tbm_matching.ranking import aggregate_to_documents, reciprocal_rank_fusion

# ---------------------------------------------------------------------------
# Extraction & fusion helpers (used directly by Temporal workflows)
# ---------------------------------------------------------------------------


def extract_tbms_for_satz(norm_data: NormData, satz_id: str) -> list[dict[str, Any]]:
    """Each TBM dict is enriched with _absatz_text, _paragraph_nr, _jurabk, _absatz_nr, and _satz_nr."""
    absatz_nr, satz_nr, satz = _find_satz_context(norm_data, satz_id)
    absatz_text = next(
        (absatz.absatz_text or "" for absatz in norm_data.absaetze if str(absatz.absatz_nr) == absatz_nr),
        "",
    )
    all_tbms: list[dict[str, Any]] = []

    for tbm_model in satz.atomare_tatbestandsmerkmale:
        tbm = tbm_model.model_dump()
        tbm["_absatz_text"] = absatz_text
        tbm["_paragraph_nr"] = norm_data.paragraph_nr
        tbm["_jurabk"] = norm_data.jurabk
        tbm["_absatz_nr"] = absatz_nr
        tbm["_satz_nr"] = satz_nr
        all_tbms.append(tbm)

    if not all_tbms:
        raise ValueError(f"No TBMs found for satz_id={satz_id}")

    return all_tbms


def fuse_retrieval_results(
    tbm_list: list[dict[str, Any]],
    source_chunks: list[list[dict[str, Any]]],
    source_summaries: list[list[dict[str, Any]]],
    source_questions: list[list[dict[str, Any]]],
    source_rules: list[list[dict[str, Any]]],
    top_k: int = CONFIG.MATCHING.DEFAULT_TOP_K,
) -> list[dict[str, Any]]:
    """Rule-based docs missing from the RRF-fused list are appended at the end; results are written to tbm['svms']."""
    source_chunks_agg = [aggregate_to_documents(docs) for docs in source_chunks]
    source_summaries_agg = [aggregate_to_documents(docs) for docs in source_summaries]
    source_questions_agg = [aggregate_to_documents(docs) for docs in source_questions]

    enriched_tbms: list[dict[str, Any]] = []
    for tbm, docs_chunks, docs_summaries, docs_questions, docs_rules in zip(
        tbm_list,
        source_chunks_agg,
        source_summaries_agg,
        source_questions_agg,
        source_rules,
        strict=True,
    ):
        retrieval_sources = [s for s in [docs_chunks, docs_summaries, docs_questions] if s]
        fused_docs = reciprocal_rank_fusion(retrieval_sources, top_k=top_k)

        existing_titles = {d.get("title") for d in fused_docs}
        for doc in docs_rules or []:
            if doc.get("title") not in existing_titles:
                fused_docs.append(doc)
                existing_titles.add(doc.get("title"))

        tbm["svms"] = fused_docs
        enriched_tbms.append(tbm)
    return enriched_tbms
