from typing import Any
from uuid import UUID

from temporal import get_temporal_client
from temporalio import activity


@activity.defn
async def cancel_project_version_workflows(
    project_id: UUID,
    project_version: int,
    excluded_workflow_ids: list[str],
) -> dict[str, Any]:
    query = f'`ExecutionStatus` = "Running" AND `ProjectId` = "{project_id}" AND `ProjectVersion` = {project_version}'
    excluded_ids = set(excluded_workflow_ids)
    cancelled: list[dict[str, str]] = []
    skipped: list[str] = []

    client = await get_temporal_client()
    async for execution in client.list_workflows(query):
        if execution.id in excluded_ids:
            skipped.append(execution.id)
            continue

        await client.get_workflow_handle(
            workflow_id=execution.id,
            run_id=execution.run_id,
        ).cancel()
        cancelled.append({"workflow_id": execution.id, "run_id": execution.run_id})

    activity.logger.info(
        "Cancelled %s running workflow(s) for project %s version %s",
        len(cancelled),
        project_id,
        project_version,
    )
    return {"cancelled": cancelled, "skipped": skipped}
