import asyncio
from collections import defaultdict
from datetime import timedelta

from prompt_injection.prompt_defense import sanitize_and_wrap_external_data, wrap_system_prompt
from pydantic import ValidationError
from temporal.activities.llm import llm_invoke_structured
from temporal.activities.models import ChatModel
from temporal.contracts import (
    DMSFileResponse,
)
from temporal.contracts import (
    PlausibilityCheckResult as DocumentOutput,
)
from temporal.contracts import (
    PlausibilityContradiction as Contradiction,
)
from temporal.utils import sliding_window
from temporalio import workflow
from temporalio.common import RetryPolicy

from src.activities import consolidation, note_verifier, rubric
from src.activities import scoring as rubric_score
from src.activities.candidates import detect_candidates
from src.activities.clustering import build_clusters
from src.activities.confidence import confidence
from src.activities.dms_activities import (
    UploadTemporalCheckpointInput,
    upload_temporal_checkpoint,
)
from src.activities.notes import build_notes
from src.activities.risk_screener import check_overflow_pairs
from src.config.config import config
from src.config.env import ENV
from src.workflows.check_logic_wf.prompts.note_verifier_prompts import verifier_system_prompt
from src.workflows.check_logic_wf.prompts.rubric_prompts import RUBRIC_SYSTEM_PROMPT
from src.workflows.check_logic_wf.schemas.clustering_schemas import (
    ClusteringInput,
    InconsistencyClusters,
    InconsistencyPair,
)
from src.workflows.check_logic_wf.schemas.context_checker_schemas import (
    ChunkWithContext,
    ContextCheckerOutput,
)
from src.workflows.check_logic_wf.schemas.note_schemas import (
    BuildNotesInput,
    BuildNotesOutput,
    ChunkContextLite,
    Note,
    NoteScores,
    PageContext,
    RubricResponse,
    RubricScore,
    VerifierVote,
    WeightedVote,
    rubric_response_for,
)
from src.workflows.check_logic_wf.schemas.risk_screener_schemas import (
    DocumentBundleResult,
    GroupedScreeningBundle,
    OverflowCheckInput,
    ScreeningCandidateBundle,
    ScreeningHit,
)
from src.workflows.check_logic_wf.schemas.screening_batch_schemas import (
    ScreeningBatchInput,
    ScreeningBatchOutput,
)
from src.workflows.check_logic_wf.screening_context_batch_workflow import (
    PlausibilityScreeningContextBatchWorkflow,
)
from src.workflows.input_schemas import CheckSingleDocumentWorkflowInputSchema
from src.workflows.qdrant_wf.schemas.workflow import DocumentActivityInput


def _group_bundles_by_chunk(
    bundles: list[ScreeningCandidateBundle],
    max_per_group: int,
) -> list[list[ScreeningCandidateBundle]]:
    """Group bundles by chunk_id (shared reference pool), then pack small groups to avoid under-filled LLM calls."""
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


async def _candidate_hits(project_id: str, document_id: str, bundle_result: DocumentBundleResult) -> list[ScreeningHit]:
    """Detector and overflow hits (deterministic candidates); deduplicated against each other."""
    hits: list[ScreeningHit] = []
    raw_det: list[ScreeningHit] = await workflow.execute_activity(
        detect_candidates,
        arg=DocumentActivityInput(project_id=project_id, document_id=document_id),
        start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
    )
    hits.extend(ScreeningHit.model_validate(h) for h in raw_det)
    if bundle_result.overflow_pairs:
        raw_ovf: list[ScreeningHit] = await workflow.execute_activity(
            check_overflow_pairs,
            arg=OverflowCheckInput(project_id=project_id, pairs=bundle_result.overflow_pairs),
            start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
        )
        hits.extend(ScreeningHit.model_validate(h) for h in raw_ovf)
    seen: set[frozenset[str]] = set()
    unique: list[ScreeningHit] = []
    for h in hits:
        key = frozenset((h.claim_id, h.reference_id))
        if key not in seen:
            seen.add(key)
            unique.append(h)
    if unique:
        workflow.logger.info("Candidate sources: %d deterministic hits for document %s", len(unique), document_id)
    return unique


def _chunk_context_lites(outputs: list[ContextCheckerOutput]) -> dict[str, ChunkContextLite]:
    """Chunk contexts already resolved by the batch workflows, reduced to what the note builder needs."""
    lites: dict[str, ChunkContextLite] = {}

    def add(chunk_id: str, ctx: ChunkWithContext) -> None:
        if chunk_id in lites:
            return
        lites[chunk_id] = ChunkContextLite(
            document_id=ctx.document_id,
            document_name=ctx.document_name,
            chunk_text=ctx.chunk_text,
            preceding_text=ctx.preceding_text,
            following_text=ctx.following_text,
            page_numbers=list(ctx.page_numbers),
            toc_path=list(ctx.toc_path or []),
        )

    for out in outputs:
        if not out.is_inconsistency:
            continue
        add(out.chunk_a_id, out.chunk_a_context)
        add(out.chunk_b_id, out.chunk_b_context)
    return lites


async def _verifier_vote(payload: str, seed: int, escalation: bool, model: ChatModel) -> WeightedVote:
    """One adversarial verifier vote."""
    p = config.NOTE_VERIFIER
    effort = p.ESCALATION_REASONING_EFFORT if escalation else p.BASE_REASONING_EFFORT
    vote = await llm_invoke_structured(
        prompt=sanitize_and_wrap_external_data(payload) + f"\n\n[Durchgang {seed}]",
        system_prompt=wrap_system_prompt(verifier_system_prompt(effort, escalation), lang="de"),
        output_class=VerifierVote,
        model=model,
        temperature=0.0,
        top_p=1.0,
        reasoning_effort=effort,
        retry_policy=config.TEMPORAL.LLM_RETRY_POLICY,
    )
    return WeightedVote(
        stage="eskalation" if escalation else "basis",
        weight=p.ESCALATION_WEIGHT if escalation else 1.0,
        urteil=vote.urteil,
        kategorie=vote.kategorie,
        grund=vote.grund,
    )


async def _verifier_votes(note: Note, model: ChatModel) -> tuple[list[WeightedVote], bool]:
    """Base pass (k votes) and, on a base majority, the second-opinion veto pass (weighted 2x)."""
    p = config.NOTE_VERIFIER
    if note_verifier.skip_verifier(note):
        return [], True
    payload = note_verifier.verifier_payload(note)
    votes: list[WeightedVote] = list(
        await asyncio.gather(*[_verifier_vote(payload, seed, False, model) for seed in range(p.BASE_VOTES)])
    )
    if note_verifier.needs_escalation(votes):
        votes.extend(
            await asyncio.gather(*[_verifier_vote(payload, seed, True, model) for seed in range(p.ESCALATION_VOTES)])
        )
    return votes, False


async def _rubric_call(prompt: str, n_locations: int, model: ChatModel) -> RubricResponse | None:
    """One rubric call; the schema demands exactly ``n_locations`` entries (one per prompted location).

    Returns None when the model cannot satisfy the count within the validation retries.
    """
    try:
        return await llm_invoke_structured(
            prompt=sanitize_and_wrap_external_data(prompt),
            system_prompt=wrap_system_prompt(RUBRIC_SYSTEM_PROMPT, lang="de"),
            output_class=rubric_response_for(n_locations),
            model=model,
            temperature=0.0,
            top_p=1.0,
            reasoning_effort=config.RUBRIC.REASONING_EFFORT,
            retry_policy=config.TEMPORAL.LLM_RETRY_POLICY,
            max_validation_attempts=config.RUBRIC.MAX_VALIDATION_ATTEMPTS,
        )
    except ValidationError:
        workflow.logger.warning(
            "Rubric: location count still wrong after %d attempts", config.RUBRIC.MAX_VALIDATION_ATTEMPTS
        )
        return None


async def _rubric_score(
    note: Note, pages: dict[str, PageContext], model: ChatModel
) -> tuple[RubricResponse | None, RubricScore]:
    """Rubric with page context, deterministic score, selective second view (score = minimum)."""
    if note.gate_reason:
        return None, RubricScore(score=0, grund=f"Gate: {note.gate_reason}")
    fs = rubric.prompt_locations(note)
    answer = await _rubric_call(rubric.rubric_prompt_page(note), len(fs), model)
    if answer is None:
        return None, RubricScore(
            score=0, grund=f"Rubrik: Stellenzahl weicht von {len(fs)} Fundstellen ab", evaluated=False
        )
    scoring = rubric_score.score_note(answer, fs, pages)
    if scoring.score >= config.RUBRIC.SELF_CONSISTENCY_THRESHOLD:
        second_view = await _rubric_call(rubric.rubric_prompt_chunk(note), len(fs), model)
        if second_view is None:
            return answer, RubricScore(score=0, grund="Rubrik (Chunk-Sicht): Stellenzahl weicht ab", evaluated=False)
        b2 = rubric_score.score_note(second_view, fs, pages)
        if b2.score < scoring.score:
            scoring = RubricScore(score=b2.score, grund=f"Selbstkonsistenz: {b2.grund}", art=b2.art)
    return answer, scoring


async def _score_note(note: Note, pages: dict[str, PageContext], model: ChatModel) -> NoteScores:
    """Run rubric and verifier for one note.

    With ``NOTE_VERIFIER.MIN_SCORE_B`` set, the verifier runs only for notes reaching it
    or not judged by the rubric; otherwise both run in parallel.
    """
    min_b = config.NOTE_VERIFIER.MIN_SCORE_B
    if min_b is None:
        (votes, skipped), (answer, scoring) = await asyncio.gather(
            _verifier_votes(note, model),
            _rubric_score(note, pages, model),
        )
    else:
        answer, scoring = await _rubric_score(note, pages, model)
        votes: list[WeightedVote] = []
        skipped = True
        if not scoring.evaluated or scoring.score >= min_b:
            votes, skipped = await _verifier_votes(note, model)
    return NoteScores(
        note_id=note.note_id,
        score_a=note_verifier.score_a(note, votes),
        score_b=float(scoring.score) if scoring.evaluated else None,
        votes=votes,
        rubric=answer,
        rubric_score=scoring,
        verifier_skipped=skipped,
    )


async def _upload_document_output(
    workflow_input: CheckSingleDocumentWorkflowInputSchema, document_output: DocumentOutput
) -> DMSFileResponse:
    """Upload the document result as checkpoint file named after the parent run."""
    workflow_info = workflow.info()
    parent_run_id = workflow_info.parent.run_id if workflow_info.parent else workflow_info.run_id
    return await workflow.execute_activity(
        upload_temporal_checkpoint,
        UploadTemporalCheckpointInput(
            project_id=workflow_input.project_id,
            workflow_id=workflow_info.workflow_id,
            run_id=workflow_info.run_id,
            filename=f"plausibility_{workflow_input.document_id}_{parent_run_id}.json",
            payload=document_output.model_dump(mode="json", by_alias=True),
        ),
        task_queue=workflow_info.task_queue,
        start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
    )


def _compose_output(notes: list[Note], note_scores: dict[str, NoteScores]) -> list[Contradiction]:
    """Duplicate consolidation, deterministic composition, confidence per entry."""
    contradictions = [
        consolidation.compose(group, note_scores, str(workflow.uuid4()))
        for group in consolidation.groups(notes, note_scores)
    ]
    scores_a = [c.score_a or 0.0 for c in contradictions]
    scores_b = [c.score_b for c in contradictions]
    for c, k in zip(contradictions, confidence(scores_a, scores_b), strict=True):
        c.confidence_score = k
    contradictions.sort(key=lambda c: -(c.confidence_score or 0.0))
    return contradictions


@workflow.defn
class PlausibilityCheckSingleDocumentWorkflow:
    """Runs the full plausibility-check pipeline for a single document."""

    @workflow.run
    async def run(self, workflow_input: CheckSingleDocumentWorkflowInputSchema) -> DMSFileResponse:
        """Execute screening, context check, clustering, note scoring, consolidation and upload."""
        model: ChatModel = ENV.LITELLM.MODEL

        if not workflow_input.has_claims:
            workflow.logger.info(
                "No claims found for document %s — skipping screening.",
                workflow_input.document_id,
            )
            return await _upload_document_output(workflow_input, DocumentOutput(contradictions=[]))

        bundle_result = workflow_input.bundle_result
        bundles = [b for b in bundle_result.bundles if b.reference_claims]

        # Deterministic candidate sources that bypass the LLM screener.
        extra_hits = await _candidate_hits(workflow_input.project_id, workflow_input.document_id, bundle_result)

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

        bundle_batches: list[list[GroupedScreeningBundle]] = [
            grouped_bundles[i : i + batch_size] for i in range(0, len(grouped_bundles), batch_size)
        ]
        if extra_hits and not bundle_batches:
            bundle_batches = [[]]  # candidates exist although the screener has nothing to do
        indexed_batches = list(enumerate(bundle_batches))

        batch_results: list[ScreeningBatchOutput] = await sliding_window(
            indexed_batches,
            lambda item: workflow.execute_child_workflow(
                PlausibilityScreeningContextBatchWorkflow.run,
                arg=ScreeningBatchInput(
                    project_id=workflow_input.project_id,
                    document_id=workflow_input.document_id,
                    bundles=item[1],
                    extra_hits=extra_hits if item[0] == 0 else [],
                ),
                task_queue=workflow.info().task_queue,
                task_timeout=timedelta(seconds=config.TEMPORAL.WORKFLOW_TASK_TIMEOUT_SECONDS),
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

        clusters: InconsistencyClusters = await workflow.execute_activity(
            build_clusters,
            ClusteringInput(
                project_id=workflow_input.project_id,
                document_id=workflow_input.document_id,
                inconsistency_pairs=inconsistency_pairs,
            ),
            start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
        )

        # Notes: deterministic evidence, corpus evidence block, page contexts and gate.
        notes_result = BuildNotesOutput(notes=[], pages={})
        if clusters.clusters:
            notes_result = BuildNotesOutput.model_validate(
                await workflow.execute_activity(
                    build_notes,
                    BuildNotesInput(
                        project_id=workflow_input.project_id,
                        document_id=workflow_input.document_id,
                        clusters=[c.edges for c in clusters.clusters],
                        chunk_contexts=_chunk_context_lites(context_check_outputs),
                    ),
                    start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
                    retry_policy=RetryPolicy(
                        maximum_attempts=config.TEMPORAL.ACTIVITY_MAX_RETRIES,
                        initial_interval=timedelta(seconds=10),
                        backoff_coefficient=2,
                        maximum_interval=timedelta(seconds=30),
                    ),
                )
            )
        notes = notes_result.notes

        # Verification (adversarial verifier) and rubric per note, then their mean.
        scores_list: list[NoteScores] = await sliding_window(
            notes,
            lambda note: _score_note(note, notes_result.pages, model),
            concurrency=config.TEMPORAL.MAX_PENDING_ACTIVITIES,
        )
        note_scores = {b.note_id: b for b in scores_list}

        contradictions = _compose_output(notes, note_scores)

        return await _upload_document_output(workflow_input, DocumentOutput(contradictions=contradictions))
