# ruff: noqa: E402
import asyncio

from temporal.observability import (
    ObservabilityConfig,
    setup_observability,
    shutdown_observability,
)

from src.config.env import ENV

setup_observability(
    ObservabilityConfig(
        service_name=ENV.OTEL_SERVICE_NAME,
        otel_endpoint=ENV.OTEL_ENDPOINT,
    )
)

from temporal.s3_payload_storage import S3PayloadStorage
from temporal.worker import start_temporal_worker
from temporal.workflows.modul_suche_und_zuordnung.satz_orchestrator_workflow import (
    TASK_QUEUE as MODUL_SUCHE_UND_ZUORDNUNG_TASK_QUEUE,
)

from src.Activities.law_db_activities import (
    _query_k_results_ut,
    _query_top_k_dr,
)
from src.Activities.processing_activities import (
    _fetch_rule_based,
    _retrieve_chunks,
    _retrieve_questions,
    _retrieve_summaries,
)
from src.workflows.match_single_tbm_workflow import MatchSingleTBMWorkflow
from src.workflows.pageindex_svm_workflow import PageIndexSVMWorkflow
from src.workflows.satz_orchestrator_workflow import SatzOrchestratorWorkflow
from src.workflows.tbm_db_research_workflow import TBMDBResearchWorkflow


async def main() -> None:
    storage = S3PayloadStorage(
        bucket_name=ENV.TEMPORAL.S3_BUCKET_NAME,
        endpoint_url=ENV.TEMPORAL.S3_ENDPOINT_URL,
        access_key=ENV.TEMPORAL.S3_ACCESS_KEY_ID.get_secret_value(),
        secret_key=ENV.TEMPORAL.S3_SECRET_ACCESS_KEY.get_secret_value(),
        region=ENV.TEMPORAL.S3_REGION,
    )
    try:
        await start_temporal_worker(
            host=ENV.TEMPORAL.HOST,
            workflows=[
                MatchSingleTBMWorkflow,
                TBMDBResearchWorkflow,
                PageIndexSVMWorkflow,
                SatzOrchestratorWorkflow,
            ],
            activities=[
                _retrieve_chunks,
                _retrieve_summaries,
                _retrieve_questions,
                _fetch_rule_based,
                _query_top_k_dr,
                _query_k_results_ut,
            ],
            task_queue=MODUL_SUCHE_UND_ZUORDNUNG_TASK_QUEUE,
            storage=storage,
        )
    finally:
        shutdown_observability()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
