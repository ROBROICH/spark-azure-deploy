from src.activities.law_api_calls import (
    _fetch_absaetze,
    _fetch_document_by_jurabk,
    _fetch_document_by_search_term,
    _fetch_documents,
    _fetch_norm,
    _ld_table_get_definitions_by_jurabk_titel,
    _query_chunks_ut,
    _query_k_results_ut,
    _query_top_k_dr,
    _tn_table_get_by_dokument,
)
from src.activities.wiktionary import _get_wiktionary_meaning

activities = [
    _fetch_documents,
    _fetch_document_by_search_term,
    _fetch_document_by_jurabk,
    _fetch_absaetze,
    _fetch_norm,
    _ld_table_get_definitions_by_jurabk_titel,
    _tn_table_get_by_dokument,
    _get_wiktionary_meaning,
    _query_top_k_dr,
    _query_k_results_ut,
    _query_chunks_ut,
]
