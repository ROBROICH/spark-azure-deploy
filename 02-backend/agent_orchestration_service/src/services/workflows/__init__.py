from src.services.activities.fvp import (
    fetch_existing_dokument_nodes,
    get_formal_completeness_results,
    get_project_files,
    get_template_document_types,
    get_topics,
    mark_toc_document,
    update_file_topics,
)
from src.services.activities.results import (
    _send_fvp_results,
    _send_plausibility_results,
    _send_toc_matching_results,
)
from src.services.workflows.diplan import DiPlanWorkflow
from src.services.workflows.diplan_download import (
    DiPlanDownloadWorkflow,
    download_diplan_file,
)
from src.services.workflows.fpp_download import (
    FPPDownloadWorkflow,
    download_fpp_file,
)
from src.services.workflows.fvp import FVPWorkflow
from src.services.workflows.fvp_workflow import IsolatedFVPWorkflow
from src.workflows.batch_mvp.activity import _fetch_project_norms, _process_cached_norm_deconstructions
from src.workflows.batch_mvp.workflow import BatchMVPWorkflow
from src.workflows.bewertung.gather import _gather_norm_context
from src.workflows.bewertung.insert import (
    InsertBewertungResultsWorkflow,
    _write_bewertung_satz_result,
)
from src.workflows.bewertung.orchestrator import BewertungOrchestratorWorkflow, start_and_await_suz
from src.workflows.bewertung.process import ProcessBewertungenWorkflow
from src.workflows.ewms.activity import (
    _fetch_argument_topics,
    _fetch_ewms_documents,
    _fetch_processed_file_ids,
    _mark_classification_failed,
    _store_classification_results,
    _store_extraction_results,
    _store_injection_results,
)
from src.workflows.ewms.workflow import EWMSEntrypointWorkflow, EWMSOrchestratorWorkflow
from src.workflows.insert_extraction_results.activity import (
    _batch_insert_extraction_nodes,
)
from src.workflows.insert_extraction_results.fetch_activity import (
    _fetch_processed_documents_from_graph,
)
from src.workflows.insert_extraction_results.workflow import InsertExtractionResultsWorkflow
from src.workflows.insert_rechtsmethodik_results.activity import (
    _fetch_examination_rechtsmethodik_context,
    _fetch_pls_topic_norms,
    _insert_rechtsmethodik_result,
)
from src.workflows.insert_rechtsmethodik_results.workflow import InsertRechtsmethodikResultsWorkflow
from src.workflows.insert_suche_zuordnung_results.activity import (
    _fetch_existing_dokumente_for_suz,
    _resolve_chunk_dokumente,
    _write_satz_fundstellen,
)
from src.workflows.insert_suche_zuordnung_results.workflow import InsertSucheZuordnungResultsWorkflow
from src.workflows.mvp.activity import _get_norm_deconstruction, _save_norm_deconstruction
from src.workflows.mvp.workflow import MVPWorkflow
from src.workflows.risikohinweise.activity import (
    _fetch_risikohinweis_chapter,
    _replace_vae_node_risks,
)
from src.workflows.risikohinweise.workflow import RisikohinweiseWorkflow
from src.workflows.suche_zuordnung_norm.activity import (
    _fetch_document_nodes,
    _fetch_norm_data,
    _fetch_norm_examination_ids,
)
from src.workflows.suche_zuordnung_norm.workflow import SucheZuordnungNormWorkflow

workflows = [
    DiPlanWorkflow,
    DiPlanDownloadWorkflow,
    IsolatedFVPWorkflow,
    FVPWorkflow,
    InsertExtractionResultsWorkflow,
    InsertRechtsmethodikResultsWorkflow,
    MVPWorkflow,
    BatchMVPWorkflow,
    FPPDownloadWorkflow,
    SucheZuordnungNormWorkflow,
    BewertungOrchestratorWorkflow,
    ProcessBewertungenWorkflow,
    InsertBewertungResultsWorkflow,
    InsertSucheZuordnungResultsWorkflow,
    EWMSOrchestratorWorkflow,
    EWMSEntrypointWorkflow,
    RisikohinweiseWorkflow,
]
activities = [
    download_diplan_file,
    download_fpp_file,
    _send_fvp_results,
    _send_plausibility_results,
    fetch_existing_dokument_nodes,
    get_formal_completeness_results,
    get_project_files,
    get_template_document_types,
    _send_toc_matching_results,
    mark_toc_document,
    _batch_insert_extraction_nodes,
    _fetch_examination_rechtsmethodik_context,
    _fetch_pls_topic_norms,
    _insert_rechtsmethodik_result,
    _get_norm_deconstruction,
    _save_norm_deconstruction,
    _fetch_project_norms,
    _process_cached_norm_deconstructions,
    get_topics,
    update_file_topics,
    _fetch_document_nodes,
    _fetch_norm_data,
    _fetch_norm_examination_ids,
    _gather_norm_context,
    _write_bewertung_satz_result,
    _fetch_existing_dokumente_for_suz,
    _resolve_chunk_dokumente,
    _write_satz_fundstellen,
    _fetch_processed_documents_from_graph,
    start_and_await_suz,
    _fetch_ewms_documents,
    _fetch_processed_file_ids,
    _fetch_argument_topics,
    _store_extraction_results,
    _store_classification_results,
    _store_injection_results,
    _mark_classification_failed,
    _fetch_risikohinweis_chapter,
    _replace_vae_node_risks,
]
