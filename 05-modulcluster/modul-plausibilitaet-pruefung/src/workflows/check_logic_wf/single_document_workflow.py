from collections import defaultdict
from datetime import timedelta

from prompt_injection.prompt_defense import sanitize_and_wrap_external_data, wrap_system_prompt
from temporal.activities.llm import llm_invoke_structured
from temporal.activities.models import ChatModel
from temporal.utils import sliding_window
from temporalio import workflow
from temporalio.common import RetryPolicy

from src.activities.cluster_summarizer import build_clusters
from src.activities.dms_activities import (
    UploadTemporalCheckpointInput,
    upload_temporal_checkpoint,
)
from src.activities.qdrant_activities import get_claim_ids
from src.activities.risk_screener import build_screening_bundles_for_document
from src.config.config import config
from src.config.env import ENV
from src.dms.schemas import DMSFileResponse
from src.workflows.check_logic_wf.prompts.cluster_summarizer_prompts import (
    CLUSTER_SUMMARIZER_SYSTEM_PROMPT,
)
from src.workflows.check_logic_wf.schemas.cluster_summarizer_schemas import (
    ClusteringInput,
    InconsistencyCluster,
    InconsistencyGraph,
    InconsistencyPair,
    InconsistencySummary,
    InconsistencySummaryLLMResponse,
    IndexedInconsistencyEdge,
    SummarizerResponse,
)
from src.workflows.check_logic_wf.schemas.context_checker_schemas import (
    ContextCheckerOutput,
)
from src.workflows.check_logic_wf.schemas.output_schemas import (
    Contradiction,
    ContradictionStatus,
    DocumentOutput,
    Occurrence,
)
from src.workflows.check_logic_wf.schemas.risk_screener_schemas import (
    DocumentBundleRequest,
    DocumentBundleResult,
    GroupedScreeningBundle,
    ScreeningCandidateBundle,
)
from src.workflows.check_logic_wf.schemas.screening_batch_schemas import (
    ScreeningBatchInput,
    ScreeningBatchOutput,
)
from src.workflows.check_logic_wf.screening_context_batch_workflow import (
    PlausibilityScreeningContextBatchWorkflow,
)
from src.workflows.input_schemas import SingleDocumentWorkflowInputSchema
from src.workflows.qdrant_wf.schemas.workflow import DocumentActivityInput


def _deduplicate_bundles(
    bundles: list[ScreeningCandidateBundle],
) -> list[ScreeningCandidateBundle]:
    """Remove symmetric claim pairs, keeping only the direction whose primary claim
    appears first in ``bundles``.

    For every (A, B) pair discovered across all bundles, only the bundle whose
    primary claim is encountered first retains the reference.
    This is a pure deterministic function — safe to call directly in workflow code.
    """
    seen_pairs: set[frozenset[str]] = set()
    deduplicated: list[ScreeningCandidateBundle] = []

    for bundle in bundles:
        kept_refs: list[str] = []
        for ref_id in bundle.reference_claims:
            pair: frozenset[str] = frozenset({bundle.claim_id, ref_id})
            if pair not in seen_pairs:
                seen_pairs.add(pair)
                kept_refs.append(ref_id)
        deduplicated.append(bundle.model_copy(update={"reference_claims": kept_refs}))

    return deduplicated


def _group_bundles_by_chunk(
    bundles: list[ScreeningCandidateBundle],
    max_per_group: int,
) -> list[list[ScreeningCandidateBundle]]:
    """Group bundles by chunk_id, then pack small groups to fill batches.

    First groups bundles by their source chunk (claims from the same chunk
    share KNN neighbours and benefit from a shared reference pool).  Chunk
    groups that already reach *max_per_group* are emitted directly.  Smaller
    groups are merged together until the batch is full — this avoids
    under-filled batches that waste an LLM call on only 1–3 claims.
    """
    by_chunk: dict[str, list[ScreeningCandidateBundle]] = defaultdict(list)
    for b in bundles:
        by_chunk[b.chunk_id].append(b)

    # Split large chunk groups and collect small ones for packing.
    full_groups: list[list[ScreeningCandidateBundle]] = []
    small_groups: list[list[ScreeningCandidateBundle]] = []

    for chunk_bundles in by_chunk.values():
        for i in range(0, len(chunk_bundles), max_per_group):
            group = chunk_bundles[i : i + max_per_group]
            if len(group) == max_per_group:
                full_groups.append(group)
            else:
                small_groups.append(group)

    # Pack small groups together (first-fit decreasing for better fill rate).
    small_groups.sort(key=len, reverse=True)
    packed: list[list[ScreeningCandidateBundle]] = []
    for group in small_groups:
        placed = False
        for batch in packed:
            if len(batch) + len(group) <= max_per_group:
                batch.extend(group)
                placed = True
                break
        if not placed:
            packed.append(list(group))

    return full_groups + packed


def _validate_stance_node_indices(
    summary: InconsistencySummaryLLMResponse,
    node_idx_to_trace: dict[int, dict[str, str | int | None]],
) -> None:
    """Reject LLM summaries that reference nodes outside the indexed cluster graph."""
    invalid_node_indices = sorted(
        {stance.node_idx for stance in summary.stances if stance.node_idx not in node_idx_to_trace}
    )
    if not invalid_node_indices:
        return

    valid_node_indices = sorted(node_idx_to_trace)
    raise ValueError(
        "Summarizer returned invalid node indices "
        f"{invalid_node_indices}; valid node indices for this cluster are {valid_node_indices}."
    )


async def _summarize_cluster(cluster: InconsistencyCluster, model: ChatModel) -> SummarizerResponse:
    """Summarize one inconsistency cluster from indexed graph evidence.

    LLM-side validation is retried inside ``llm_invoke_structured``; the
    cluster-specific cross-validation against ``node_idx_to_trace`` happens
    here in the workflow and is retried by re-invoking the LLM call.
    """
    # Build LLM-safe graph representation (UUID-like chunk IDs -> local ints).
    node_idx_to_trace: dict[int, dict[str, str | int | None]] = {}

    # Build a deterministic mapping from chunk IDs to node indices.
    chunk_id_to_node_index: dict[str, int] = {}
    next_node_index = 0

    for edge in cluster.edges:
        if edge.chunk_a_id not in chunk_id_to_node_index:
            chunk_id_to_node_index[edge.chunk_a_id] = next_node_index
            next_node_index += 1
        if edge.chunk_b_id not in chunk_id_to_node_index:
            chunk_id_to_node_index[edge.chunk_b_id] = next_node_index
            next_node_index += 1

    indexed_edges: list[IndexedInconsistencyEdge] = []
    for edge in cluster.edges:
        node_a_idx = chunk_id_to_node_index[edge.chunk_a_id]
        node_b_idx = chunk_id_to_node_index[edge.chunk_b_id]
        if node_a_idx not in node_idx_to_trace:
            node_idx_to_trace[node_a_idx] = {
                "document_id": edge.chunk_a_document_id,
                "document_name": edge.chunk_a_document_name,
                "page_number": edge.chunk_a_page_number,
            }
        if node_b_idx not in node_idx_to_trace:
            node_idx_to_trace[node_b_idx] = {
                "document_id": edge.chunk_b_document_id,
                "document_name": edge.chunk_b_document_name,
                "page_number": edge.chunk_b_page_number,
            }
        indexed_edges.append(
            IndexedInconsistencyEdge(
                node_a_idx=node_a_idx,
                node_b_idx=node_b_idx,
                content_a_excerpt=edge.content_a_excerpt,
                content_b_excerpt=edge.content_b_excerpt,
                title=edge.title,
                explanation=edge.explanation,
            )
        )
    graph_representation = InconsistencyGraph(edges=indexed_edges)

    excerpt_by_node_idx: dict[int, str] = {}
    for edge in indexed_edges:
        excerpt_by_node_idx.setdefault(edge.node_a_idx, edge.content_a_excerpt)
        excerpt_by_node_idx.setdefault(edge.node_b_idx, edge.content_b_excerpt)

    max_validation_attempts = 3
    for attempt in range(1, max_validation_attempts + 1):
        summary = await llm_invoke_structured(
            prompt=sanitize_and_wrap_external_data(graph_representation.model_dump_json(indent=2)),
            system_prompt=wrap_system_prompt(CLUSTER_SUMMARIZER_SYSTEM_PROMPT, lang="de"),
            output_class=InconsistencySummaryLLMResponse,
            model=model,
            temperature=0.0,
            top_p=1.0,
            reasoning_effort="medium",
            retry_policy=config.TEMPORAL.LLM_RETRY_POLICY,
        )
        try:
            _validate_stance_node_indices(summary, node_idx_to_trace)
            break
        except ValueError:
            if attempt == max_validation_attempts:
                raise
            workflow.logger.warning(
                "Summarizer node-index validation failed (attempt %d/%d), retrying LLM call",
                attempt,
                max_validation_attempts,
            )

    occurrences = []
    for stance in summary.stances:
        trace = node_idx_to_trace[stance.node_idx]
        occurrences.append(
            Occurrence(  # pyrefly: ignore[missing-argument]  # populate_by_name=True allows snake_case
                document_id=str(trace["document_id"]),
                document_name=str(trace["document_name"]) if trace["document_name"] is not None else None,
                page_number=trace.get("page_number"),
                content_excerpt=excerpt_by_node_idx.get(stance.node_idx, stance.stance_text),
                contradiction=stance.stance_text,
            )
        )
    full_summary = InconsistencySummary(**summary.model_dump(), occurrences=occurrences)
    return SummarizerResponse(inconsistencies=[full_summary])


@workflow.defn
class PlausibilityCheckSingleDocumentWorkflow:
    """Runs the full plausibility-check pipeline for a single document."""

    @workflow.run
    async def run(self, workflow_input: SingleDocumentWorkflowInputSchema) -> DMSFileResponse:
        """Execute screening, contextual verification, clustering, summarization, and upload."""
        model: ChatModel = ENV.LITELLM.MODEL

        claim_ids: list[str] = await workflow.execute_activity(
            get_claim_ids,
            arg=DocumentActivityInput(
                project_id=workflow_input.project_id,
                document_id=workflow_input.document_id,
            ),
            start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
            retry_policy=RetryPolicy(
                maximum_attempts=config.TEMPORAL.ACTIVITY_MAX_RETRIES * 10,
                initial_interval=timedelta(seconds=10),
                backoff_coefficient=2,
                maximum_interval=timedelta(seconds=30),
            ),
        )

        if not claim_ids:
            workflow.logger.info(
                "No claims found for document %s — skipping screening.",
                workflow_input.document_id,
            )
            document_output = DocumentOutput(contradictions=[])
            workflow_info = workflow.info()
            parent_run_id = workflow_info.parent.run_id if workflow_info.parent else workflow_info.run_id
            return await workflow.execute_activity(
                upload_temporal_checkpoint,
                UploadTemporalCheckpointInput(
                    project_id=workflow_input.project_id,
                    workflow_id=workflow_info.workflow_id,
                    run_id=workflow_info.run_id,
                    filename=f"plausibility_{workflow_input.document_id}_{parent_run_id}.json",
                    payload=document_output.model_dump(mode="json"),
                ),
                task_queue=workflow_info.task_queue,
                start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
            )

        raw_bundle_result: DocumentBundleResult = await workflow.execute_activity(
            build_screening_bundles_for_document,
            DocumentBundleRequest(
                project_id=workflow_input.project_id,
                document_id=workflow_input.document_id,
                claim_ids=claim_ids,
            ),
            start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
            retry_policy=RetryPolicy(
                maximum_attempts=config.TEMPORAL.ACTIVITY_MAX_RETRIES * 10,
                initial_interval=timedelta(seconds=10),
                backoff_coefficient=2,
                maximum_interval=timedelta(seconds=30),
            ),
        )
        bundles = _deduplicate_bundles(raw_bundle_result.bundles)
        bundles = [b for b in bundles if b.reference_claims]

        # Group bundles by chunk_id for batched screening
        grouped_bundles = [
            GroupedScreeningBundle(
                project_id=workflow_input.project_id,
                document_id=workflow_input.document_id,
                bundles=group,
            )
            for group in _group_bundles_by_chunk(bundles, config.RISK_SCREENING.SCREENING_CLAIMS_PER_BATCH)
        ]

        # Fan out screening + context-check into child workflow batches (bounded history per child)
        batch_size = config.TEMPORAL.CHILD_WORKFLOW_BATCH_SIZE

        bundle_batches = [grouped_bundles[i : i + batch_size] for i in range(0, len(grouped_bundles), batch_size)]
        indexed_batches = list(enumerate(bundle_batches))

        batch_results: list[ScreeningBatchOutput] = await sliding_window(
            indexed_batches,
            lambda item: workflow.execute_child_workflow(
                PlausibilityScreeningContextBatchWorkflow.run,
                arg=ScreeningBatchInput(
                    project_id=workflow_input.project_id,
                    document_id=workflow_input.document_id,
                    bundles=item[1],
                ),
                task_queue=workflow.info().task_queue,
                task_timeout=timedelta(seconds=60),
            ),
            concurrency=config.TEMPORAL.MAX_PENDING_ACTIVITIES,
        )
        context_check_outputs: list[ContextCheckerOutput] = [
            output for result in batch_results for output in result.context_check_outputs
        ]

        inconsistency_pairs = []
        for result in context_check_outputs:
            if result.is_inconsistency and result.verdict is not None:
                inconsistency_pairs.append(
                    InconsistencyPair(
                        chunk_a_id=result.chunk_a_id,
                        chunk_b_id=result.chunk_b_id,
                        chunk_a_document_id=result.chunk_a_context.document_id,
                        chunk_b_document_id=result.chunk_b_context.document_id,
                        claim_a_id=result.claim_a_id,
                        claim_b_id=result.claim_b_id,
                        content_a_excerpt=result.verdict.chunk_a_excerpt,
                        content_b_excerpt=result.verdict.chunk_b_excerpt,
                        chunk_a_document_name=result.chunk_a_context.document_name,
                        chunk_b_document_name=result.chunk_b_context.document_name,
                        chunk_a_page_number=(
                            result.chunk_a_context.page_numbers[0] if result.chunk_a_context.page_numbers else None
                        ),
                        chunk_b_page_number=(
                            result.chunk_b_context.page_numbers[0] if result.chunk_b_context.page_numbers else None
                        ),
                        rating=result.verdict.rating,
                        title=result.verdict.title,
                        explanation=result.verdict.explanation,
                    )
                )

        inconsistency_cluster_groups = await workflow.execute_activity(
            build_clusters,
            ClusteringInput(
                project_id=workflow_input.project_id,
                document_id=workflow_input.document_id,
                inconsistency_pairs=inconsistency_pairs,
            ),
            start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
        )

        summarizer_results = await workflow.asyncio.gather(
            *[_summarize_cluster(cluster, model) for cluster in inconsistency_cluster_groups.clusters]
        )
        # Flatten per-cluster summarizer responses into one list.
        inconsistency_summaries = []
        for cluster, result in zip(
            inconsistency_cluster_groups.clusters,
            summarizer_results,
            strict=True,
        ):
            # The checker produces ratings for verified pairwise contradictions.
            # After clustering, one summarized contradiction can represent more
            # than two underlying occurrences/edges. We therefore lift the
            # strongest verified edge rating onto the cluster summary so the
            # final contradiction keeps a single, conservative score.
            cluster_rating = max((edge.rating for edge in cluster.edges), default=None)
            inconsistency_summaries.extend(
                summary.model_copy(update={"rating": cluster_rating}) for summary in result.inconsistencies
            )

        # Build the document-level output object stored in DMS.
        contradictions = []
        for summary in inconsistency_summaries:
            contradictions.append(
                Contradiction(
                    id=str(workflow.uuid4()),
                    title=summary.cluster_title,
                    description=summary.cluster_explanation,
                    rating=summary.rating,
                    status=ContradictionStatus.OPEN,
                    occurrences=summary.occurrences,
                )
            )

        document_output = DocumentOutput(contradictions=contradictions)

        workflow_info = workflow.info()
        parent_run_id = workflow_info.parent.run_id if workflow_info.parent else workflow_info.run_id

        upload_input = UploadTemporalCheckpointInput(
            project_id=workflow_input.project_id,
            workflow_id=workflow_info.workflow_id,
            run_id=workflow_info.run_id,
            filename=f"plausibility_{workflow_input.document_id}_{parent_run_id}.json",
            payload=document_output.model_dump(mode="json"),
        )

        upload_response = await workflow.execute_activity(
            upload_temporal_checkpoint,
            upload_input,
            task_queue=workflow_info.task_queue,
            start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
        )

        return upload_response
