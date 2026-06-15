"""Main orchestration workflow for the assessment pipeline."""

from __future__ import annotations

from temporal.workflows.bewertung.bewertung import bewertungs_workflow_id
from temporal.workflows.bewertung.types import (
    BewertungsWorkflowInput,
    BewertungsWorkflowOutput,
    KapitelOutput,
    Originaltext,
    Quelle,
)
from temporalio import workflow

from src.config import CHILD_WORKFLOW_RETRY_POLICY, config
from src.models.types import (
    ApplicabilityInput,
    ApplicabilityResult,
    ApplicabilityStatus,
    MicroBuilderInput,
    PlannerInput,
    WriterInput,
)
from src.workflows.applicability import ApplicabilityWorkflow
from src.workflows.micro_builder import MicroBuilderWorkflow
from src.workflows.planner import PlannerWorkflow
from src.workflows.writer import WriterWorkflow


def _assign_simple_ids(
    originaltexte: list[Originaltext],
) -> tuple[list[Originaltext], dict[str, str]]:
    """Assign sequential 4-digit IDs for LLM processing.

    Returns the rewritten chunks and a mapping simple_id → original node_id.
    """
    id_mapping: dict[str, str] = {}
    rewritten: list[Originaltext] = []
    for idx, chunk in enumerate(originaltexte, 1):
        simple_id = f"{idx:04d}"
        id_mapping[simple_id] = chunk.node_id
        rewritten.append(
            Originaltext(
                document_id=chunk.document_id,
                node_id=simple_id,
                title=chunk.title,
                text=chunk.text,
                chunk_ids=chunk.chunk_ids,
                page_numbers=chunk.page_numbers,
            )
        )
    return rewritten, id_mapping


@workflow.defn(name=bewertungs_workflow_id)
class BewertungsWorkflow:
    """Main orchestration workflow for the legal assessment pipeline."""
    @workflow.run
    async def run(self, input: BewertungsWorkflowInput) -> BewertungsWorkflowOutput:
        """Execute the full assessment pipeline: micro-build, plan, write."""
        norm = f"§ {input.paragraph_nr} {input.jurabk} - {input.paragraph_title}"

        # Early return: insufficient Fundstellen for a meaningful assessment
        if len(input.originaltexte) < config.MIN_FUNDSTELLEN:
            return self._build_insufficient_fundstellen_output(input, norm)

        # Preprocessing: assign simple sequential IDs for LLM processing
        preprocessed_chunks, id_mapping = _assign_simple_ids(input.originaltexte)

        # Stage 1: MicroBuilder
        micro_input = MicroBuilderInput(
            norm=norm,
            satz_text=input.satz_text,
            originaltexte=preprocessed_chunks,
        )
        micros = await workflow.execute_child_workflow(
            MicroBuilderWorkflow.run,
            micro_input,
            id=str(workflow.uuid4()),
            retry_policy=CHILD_WORKFLOW_RETRY_POLICY,
        )

        # Stage 1.5: Applicability Check
        applicability = await workflow.execute_child_workflow(
            ApplicabilityWorkflow.run,
            ApplicabilityInput(
                norm=norm,
                satz_text=input.satz_text,
                micros=micros.micros,
            ),
            id=str(workflow.uuid4()),
            retry_policy=CHILD_WORKFLOW_RETRY_POLICY,
        )
        if applicability.status != ApplicabilityStatus.BEWERTEN:
            return self._build_precheck_skip_output(
                input, norm, applicability, preprocessed_chunks, id_mapping,
            )

        # Stage 2: Planner
        plan = await workflow.execute_child_workflow(
            PlannerWorkflow.run,
            PlannerInput(
                norm=norm,
                satz_text=input.satz_text,
                micros=micros.micros,
            ),
            id=str(workflow.uuid4()),
            retry_policy=CHILD_WORKFLOW_RETRY_POLICY,
        )

        # Stage 3: Writer + Quality Review
        writer_input = WriterInput(
            satz_id=input.satz_id,
            norm=norm,
            satz_text=input.satz_text,
            originaltexte=preprocessed_chunks,
            plan=plan,
        )
        final_output = await workflow.execute_child_workflow(
            WriterWorkflow.run,
            writer_input,
            id=str(workflow.uuid4()),
            retry_policy=CHILD_WORKFLOW_RETRY_POLICY,
        )

        # Postprocessing: map simple IDs back to original node_ids
        chunks_by_id: dict[str, Originaltext] = {c.node_id: c for c in preprocessed_chunks}

        # Collect all used SVM-IDs across chapters
        all_used_ids: set[str] = set()
        for k in final_output.kapitel:
            all_used_ids.update(k.used_svm_ids)

        # Build quellen: simple_id → Quelle (with original node_id as UUID)
        quellen = {
            sid: Quelle(
                document_id=chunks_by_id[sid].document_id,
                node_id=id_mapping.get(sid, sid),
                title=chunks_by_id[sid].title,
                chunk_ids=chunks_by_id[sid].chunk_ids,
                page_numbers=chunks_by_id[sid].page_numbers,
            )
            for sid in sorted(all_used_ids)
            if sid in chunks_by_id
        }

        return BewertungsWorkflowOutput(
            id=str(workflow.uuid4()),
            satz_id=final_output.satz_id,
            norm=final_output.norm,
            satz_text=final_output.satz_text,
            result=final_output.result.value,
            kurzform=final_output.kurzform,
            kapitel=[
                KapitelOutput(
                    id=str(workflow.uuid4()),
                    titel=k.titel,
                    markdown=k.markdown,
                    kurzform=k.kurzform,
                )
                for k in final_output.kapitel
            ],
            full_text=final_output.to_text(),
            sources=quellen,
        )

    def _build_precheck_skip_output(
        self,
        input: BewertungsWorkflowInput,
        norm: str,
        applicability: ApplicabilityResult,
        preprocessed_chunks: list[Originaltext],
        id_mapping: dict[str, str],
    ) -> BewertungsWorkflowOutput:
        """Build early-return output when the TBM is skipped by the pre-check."""
        quellen = {
            c.node_id: Quelle(
                document_id=c.document_id,
                node_id=id_mapping.get(c.node_id, c.node_id),
                title=c.title,
                chunk_ids=c.chunk_ids,
                page_numbers=c.page_numbers,
            )
            for c in preprocessed_chunks
        }

        kapitel = []
        if applicability.begruendung_markdown:
            kapitel.append(
                KapitelOutput(
                    id=str(workflow.uuid4()),
                    titel="Zusammenfassung",
                    markdown=applicability.begruendung_markdown,
                    kurzform=applicability.kurzform,
                )
            )

        return BewertungsWorkflowOutput(
            id=str(workflow.uuid4()),
            satz_id=input.satz_id,
            norm=norm,
            satz_text=input.satz_text,
            result="nicht_beurteilbar",
            kurzform=applicability.kurzform,
            kapitel=kapitel,
            full_text=applicability.begruendung_markdown or (
                "Das Tatbestandsmerkmal ist auf das Vorhaben nicht anwendbar."
            ),
            sources=quellen,
        )

    def _build_insufficient_fundstellen_output(
        self,
        input: BewertungsWorkflowInput,
        norm: str,
    ) -> BewertungsWorkflowOutput:
        """Build early-return output when too few Fundstellen are available."""
        quellen = {
            f"{idx:04d}": Quelle(
                document_id=chunk.document_id,
                node_id=chunk.node_id,
                title=chunk.title,
                chunk_ids=chunk.chunk_ids,
                page_numbers=chunk.page_numbers,
            )
            for idx, chunk in enumerate(input.originaltexte, 1)
        }

        return BewertungsWorkflowOutput(
            id=str(workflow.uuid4()),
            satz_id=input.satz_id,
            norm=norm,
            satz_text=input.satz_text,
            result="nicht_beurteilbar",
            kurzform="Zu wenig relevante Fundstellen für eine Bewertung.",
            kapitel=[],
            full_text=(
                "Eine ausführliche rechtliche Bewertung wird erst ab mindestens 5 "
                "relevanten Fundstellen durchgeführt. In den Quellen finden Sie die "
                "Fundstellen für eine manuelle Prüfung."
            ),
            sources=quellen,
        )
