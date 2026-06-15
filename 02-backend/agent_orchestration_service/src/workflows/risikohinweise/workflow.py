from temporal.workflows.risikohinweis.risikohinweis import execute_risikohinweis_child_workflow
from temporalio import workflow

from src.workflows.risikohinweise.activity import (
    _fetch_risikohinweis_chapter,
    _replace_vae_node_risks,
    api_call,
)
from src.workflows.risikohinweise.types import (
    RISIKOHINWEISE_WORKFLOW_ID,
    FetchRisikohinweisChapterInput,
    PersistedRisk,
    ReplaceVaeNodeRisksInput,
    RisikohinweiseWorkflowInput,
    RisikohinweiseWorkflowOutput,
)


@workflow.defn(name=RISIKOHINWEISE_WORKFLOW_ID)
class RisikohinweiseWorkflow:
    @workflow.run
    async def run(self, input: RisikohinweiseWorkflowInput) -> RisikohinweiseWorkflowOutput:
        chapter = await api_call(
            _fetch_risikohinweis_chapter,
            FetchRisikohinweisChapterInput(project_id=input.project_id, vae_node_id=input.vae_node_id),
        )
        risk_output = (
            await execute_risikohinweis_child_workflow(chapter, project_id=str(input.project_id)) if chapter else None
        )
        persisted_risks = [
            PersistedRisk(
                id=risk.risk_id,
                vae_node_id=risk.chapter_id,
                problem=risk.description,
                recommendation=risk.recommendation,
                quote=risk.quote,
                severity=risk.severity,
                implication=risk.implications,
            )
            for risk in (risk_output.risks if risk_output else [])
        ]

        replace_result = await api_call(
            _replace_vae_node_risks,
            ReplaceVaeNodeRisksInput(
                project_id=input.project_id,
                vae_node_id=input.vae_node_id,
                risks=persisted_risks,
            ),
        )

        return RisikohinweiseWorkflowOutput(
            project_id=input.project_id,
            chapters_processed=1 if chapter else 0,
            risks_persisted=replace_result.inserted_count,
        )
