import asyncio
from typing import Any
from uuid import UUID

from temporal.workflows.project_versioning.types import FileDiffSummary
from temporalio import activity

from src.services.workflows.activities.diff_apply import fetch_batch_service_nodes, fetch_service_nodes
from src.services.workflows.project_version_copy_plan import (
    BUILD_PROJECT_VERSION_COPY_PLAN,
    PROJECT_LOGIC_SERVICE,
    build_project_version_copy_plan_payload,
    prepare_project_version_copy_plan,
    topic_norm_node_refs_for_copy_plan,
)


@activity.defn(name=BUILD_PROJECT_VERSION_COPY_PLAN)
async def build_project_version_copy_plan(
    service_endpoints: list[dict[str, str]],
    project_id: UUID,
    source_version: int,
    file_diff_payload: dict[str, Any],
) -> dict[str, Any]:
    endpoints = [(row["service"], row["base_url"]) for row in service_endpoints]
    rows_per_service = await asyncio.gather(
        *(
            fetch_service_nodes(
                service_base_url=base_url,
                service_name=service,
                project_id=project_id,
                project_version=source_version,
            )
            for service, base_url in endpoints
        )
    )
    rows_by_service = {service: rows for (service, _), rows in zip(endpoints, rows_per_service, strict=True)}

    preparation = prepare_project_version_copy_plan(
        rows_by_service=rows_by_service,
        file_diff=FileDiffSummary.model_validate(file_diff_payload),
    )

    topic_norm_payload_rows: list[dict[str, Any]] = []
    topic_norm_node_refs = topic_norm_node_refs_for_copy_plan(preparation)
    if topic_norm_node_refs:
        endpoint_by_service = dict(endpoints)
        topic_norm_payload_rows = await fetch_batch_service_nodes(
            service_base_url=endpoint_by_service[PROJECT_LOGIC_SERVICE],
            service_name=PROJECT_LOGIC_SERVICE,
            project_id=project_id,
            project_version=source_version,
            nodes=topic_norm_node_refs,
        )

    return build_project_version_copy_plan_payload(
        preparation=preparation,
        topic_norm_payload_rows=topic_norm_payload_rows,
    )
