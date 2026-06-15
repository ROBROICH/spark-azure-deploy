from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any, TypedDict

from temporal.workflows.risikohinweis.types import PFBChapter
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.services.api_clients import AdministrativeFileDraftApiClient, NodeRef
from src.services.project_version_errors import PROJECT_VERSION_NON_RETRYABLE_ERROR_TYPES
from src.workflows.risikohinweise.types import (
    AfdVaeNode,
    FetchRisikohinweisChapterInput,
    ReplaceProjectRisksOutput,
    ReplaceVaeNodeRisksInput,
)

_API_TIMEOUT = timedelta(seconds=60)


class _RiskInsert(TypedDict):
    node_type: str
    id: str
    payload: dict[str, Any]


class _RiskDelete(TypedDict):
    node_type: str
    id: str


api_retry_policy = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(seconds=30),
    non_retryable_error_types=PROJECT_VERSION_NON_RETRYABLE_ERROR_TYPES,
)


async def api_call[ArgT, ReturnT](
    activity_fn: Callable[[ArgT], Awaitable[ReturnT]],
    arg: ArgT,
) -> ReturnT:
    """Execute an activity with the shared API timeout/retry defaults."""
    return await workflow.execute_activity(
        activity_fn,
        arg,
        start_to_close_timeout=_API_TIMEOUT,
        retry_policy=api_retry_policy,
    )


@activity.defn
async def _fetch_risikohinweis_chapter(input: FetchRisikohinweisChapterInput) -> PFBChapter | None:
    batch = await AdministrativeFileDraftApiClient.batch_get_nodes(
        input.project_id,
        NodeRef(node_type="vae_node", id=input.vae_node_id),
    )
    node_payload = next(iter(batch.get("results", [])), None)
    if node_payload is None:
        return None

    node = AfdVaeNode.model_validate(node_payload)
    if node.id != input.vae_node_id or node.is_hidden or not node.text.strip():
        return None

    return PFBChapter(id=node.id, title=node.title, text=node.text)


@activity.defn
async def _replace_vae_node_risks(input: ReplaceVaeNodeRisksInput) -> ReplaceProjectRisksOutput:
    existing_risks = await AdministrativeFileDraftApiClient.get_risks(input.project_id)
    existing_node_risks = [risk for risk in existing_risks if risk.vae_node_id == input.vae_node_id]
    existing_status_by_id = {str(risk.id): risk.status for risk in existing_node_risks}
    inserts: list[_RiskInsert] = []
    for risk in input.risks:
        payload = risk.model_dump(mode="json", exclude_none=True, exclude={"id"})
        if "status" not in payload:
            existing_status = existing_status_by_id.get(str(risk.id))
            if existing_status:
                payload["status"] = existing_status
        inserts.append({"node_type": "risks", "id": str(risk.id), "payload": payload})

    expected_ids = {insert["id"] for insert in inserts}
    existing_ids = {str(risk.id) for risk in existing_node_risks}
    if expected_ids and existing_ids == expected_ids:
        return ReplaceProjectRisksOutput(deleted_count=0, inserted_count=len(inserts))

    deletes: list[_RiskDelete] = [{"node_type": "risks", "id": str(risk.id)} for risk in existing_node_risks]

    if not inserts and not deletes:
        return ReplaceProjectRisksOutput(deleted_count=0, inserted_count=0)

    result = await AdministrativeFileDraftApiClient.update_nodes(
        input.project_id,
        inserts=inserts,
        deletes=deletes,
    )
    return ReplaceProjectRisksOutput(
        deleted_count=len(result.get("deleted", [])),
        inserted_count=len(result.get("inserted", [])),
    )
