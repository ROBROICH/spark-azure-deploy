from __future__ import annotations

import asyncio
from datetime import timedelta
from uuid import UUID

from temporal.activities.workflow_starts import (
    StartDecoupledParentWorkflowInput,
    start_decoupled_parent_workflow,
)
from temporal.project_context import current_project_context, use_project_context
from temporal.workflows.agent_orchestration.fvp import FVP_TASK_QUEUE, FVP_WORKFLOW_ID
from temporal.workflows.inhaltsextraktion.ensure_qdrant import (
    execute_qdrant_source_file_cleanup,
    execute_qdrant_source_file_cleanup_compensation,
)
from temporal.workflows.inhaltsextraktion.types import QdrantSourceFileCleanupInput
from temporal.workflows.project_versioning.project_versioning import CREATE_PROJECT_VERSION_WORKFLOW_ID
from temporal.workflows.project_versioning.types import (
    CreateProjectVersionInput,
    CreateProjectVersionOutput,
    FileDiffSummary,
    ProjectVersioningServiceEndpoint,
)
from temporalio import workflow
from temporalio.common import RetryPolicy, WorkflowIDReusePolicy

from src.services.workflows.project_version_copy_plan import (
    BUILD_PROJECT_VERSION_COPY_PLAN,
    DOCUMENT_MANAGEMENT_SERVICE,
    EXAMINATION_SERVICE,
    PROJECT_LOGIC_SERVICE,
    NodeKey,
    NodeSummary,
    ParentRef,
    _entry_file_ids,
    _file_roots,
    _renamed_file_names,
    _topic_norm_payloads_by_id,
    _topic_norm_revision_requests,
    build_copy_nodes_by_service,
    collect_dependents,
    decode_node_summaries,
)

__all__ = [
    "DOCUMENT_MANAGEMENT_SERVICE",
    "EXAMINATION_SERVICE",
    "PROJECT_LOGIC_SERVICE",
    "CreateProjectVersionWorkflow",
    "NodeKey",
    "NodeSummary",
    "ParentRef",
    "_entry_file_ids",
    "_file_roots",
    "_renamed_file_names",
    "_topic_norm_payloads_by_id",
    "_topic_norm_revision_requests",
    "build_copy_nodes_by_service",
    "collect_dependents",
    "decode_node_summaries",
]

WORKFLOW_STATUS_COMPLETED = "COMPLETED"
WORKFLOW_STATUS_CANCELED = "CANCELED"

PROJECT_STATUS_OPEN = "OPEN"
PROJECT_STATUS_UPLOAD_DOCUMENTS = "UPLOAD_DOCUMENTS"

SERVICE_ORDER = (
    PROJECT_LOGIC_SERVICE,
    DOCUMENT_MANAGEMENT_SERVICE,
    "formal_completeness_check",
    "plausibility_notes",
    "examination_service",
    "administrative_file_draft",
    "objections_management_service",
)

GET_PROJECT_VERSIONING_SERVICE_ENDPOINTS = "get_project_versioning_service_endpoints"
GET_LATEST_PLS_VERSION = "get_latest_pls_version"
GET_PROJECT_INTERNAL_STATUS = "get_project_internal_status"
ACQUIRE_PROJECT_VERSION_LOCK = "acquire_project_version_lock"
RELEASE_PROJECT_VERSION_LOCK = "release_project_version_lock"
UPDATE_DMS_ZIP_APPROVAL_STATUS = "update_dms_zip_approval_status"
COMMIT_DMS_ZIP_DIFF = "commit_dms_zip_diff"
UPDATE_PROJECT_STATUS = "update_project_status"
GET_DMS_ZIP_DIFF = "get_dms_zip_diff"
LIST_SERVICE_NODES = "list_service_nodes"
BATCH_GET_SERVICE_NODES = "batch_get_service_nodes"
CANCEL_PROJECT_VERSION_WORKFLOWS = "cancel_project_version_workflows"
COPY_SERVICE_VERSION_NODES = "copy_service_version_nodes"
COPY_PROJECT_ROOT_VERSION = "copy_project_root_version"
UNDO_PROJECT_ROOT_VERSION = "undo_project_root_version"
UNDO_SERVICE_VERSION = "undo_service_version"

RETRY_POLICY = RetryPolicy(
    initial_interval=timedelta(seconds=5),
    maximum_interval=timedelta(seconds=5),
    maximum_attempts=20,
)

CLEANUP_RETRY_POLICY = RetryPolicy(
    initial_interval=timedelta(seconds=5),
    maximum_interval=timedelta(seconds=30),
    maximum_attempts=0,
)

DMS_ZIP_DIFF_TIMEOUT = timedelta(minutes=10)
BUILD_PROJECT_VERSION_COPY_PLAN_TIMEOUT = timedelta(minutes=10)
COPY_SERVICE_VERSION_NODES_TIMEOUT = timedelta(seconds=30)


def _endpoint_map(rows: list[dict[str, str]]) -> dict[str, str]:
    return {
        endpoint.service: endpoint.base_url
        for endpoint in (ProjectVersioningServiceEndpoint.model_validate(row) for row in rows)
    }


@workflow.defn(name=str(CREATE_PROJECT_VERSION_WORKFLOW_ID))
class CreateProjectVersionWorkflow:
    @workflow.run
    async def run(self, input: CreateProjectVersionInput) -> CreateProjectVersionOutput:  # noqa: C901
        workflow.logger.info(
            f"CreateProjectVersionWorkflow started for project {input.project_id} "
            f"(deleted={len(input.file_diff.deleted)}, "
            f"changed={len(input.file_diff.changed)}, "
            f"renamed={len(input.file_diff.renamed)})"
        )

        endpoint_rows = await workflow.execute_activity(
            GET_PROJECT_VERSIONING_SERVICE_ENDPOINTS,
            start_to_close_timeout=timedelta(seconds=5),
            retry_policy=RETRY_POLICY,
        )
        endpoint_by_service = _endpoint_map(endpoint_rows)
        graph_endpoints = [(service, endpoint_by_service[service]) for service in SERVICE_ORDER]
        copy_endpoints = [endpoint for endpoint in graph_endpoints if endpoint[0] != DOCUMENT_MANAGEMENT_SERVICE]
        dms_base_url = endpoint_by_service[DOCUMENT_MANAGEMENT_SERVICE]
        target_version: int | None = None
        lock_token: str | None = None
        committed_services: set[str] = set()
        dms_commit_started = False
        project_root_committed = False
        qdrant_cleanup_input: QdrantSourceFileCleanupInput | None = None

        try:
            source_version: int = await workflow.execute_activity(
                GET_LATEST_PLS_VERSION,
                args=(input.project_id,),
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=RETRY_POLICY,
            )

            current_status = await workflow.execute_activity(
                GET_PROJECT_INTERNAL_STATUS,
                args=(input.project_id,),
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=RETRY_POLICY,
            )
            if current_status == PROJECT_STATUS_UPLOAD_DOCUMENTS:
                if input.zip_file_id is not None:
                    target_version = source_version
                    lock_token = await workflow.execute_activity(
                        ACQUIRE_PROJECT_VERSION_LOCK,
                        args=(input.project_id, source_version, target_version, input.zip_file_id),
                        start_to_close_timeout=timedelta(seconds=5),
                        retry_policy=RETRY_POLICY,
                    )
                    await workflow.execute_activity(
                        UPDATE_DMS_ZIP_APPROVAL_STATUS,
                        args=(dms_base_url, input.project_id, input.zip_file_id, "APPROVING"),
                        start_to_close_timeout=timedelta(seconds=5),
                        retry_policy=RETRY_POLICY,
                    )
                    await workflow.execute_activity(
                        COMMIT_DMS_ZIP_DIFF,
                        args=(
                            dms_base_url,
                            input.project_id,
                            input.zip_file_id,
                            source_version,
                            target_version,
                            lock_token,
                            True,
                        ),
                        start_to_close_timeout=DMS_ZIP_DIFF_TIMEOUT,
                        retry_policy=RETRY_POLICY,
                    )
                    await workflow.execute_activity(
                        COMMIT_DMS_ZIP_DIFF,
                        args=(
                            dms_base_url,
                            input.project_id,
                            input.zip_file_id,
                            source_version,
                            target_version,
                            lock_token,
                            False,
                        ),
                        start_to_close_timeout=DMS_ZIP_DIFF_TIMEOUT,
                        retry_policy=RETRY_POLICY,
                    )
                    await workflow.execute_activity(
                        UPDATE_PROJECT_STATUS,
                        args=(input.project_id, PROJECT_STATUS_OPEN),
                        start_to_close_timeout=timedelta(seconds=30),
                        retry_policy=RETRY_POLICY,
                    )
                    await workflow.execute_activity(
                        UPDATE_DMS_ZIP_APPROVAL_STATUS,
                        args=(dms_base_url, input.project_id, input.zip_file_id, "APPROVED"),
                        start_to_close_timeout=timedelta(seconds=5),
                        retry_policy=RETRY_POLICY,
                    )
                    await workflow.execute_activity(
                        RELEASE_PROJECT_VERSION_LOCK,
                        args=(input.project_id, lock_token, None),
                        start_to_close_timeout=timedelta(seconds=5),
                        retry_policy=RETRY_POLICY,
                    )
                    lock_token = None
                    return CreateProjectVersionOutput(
                        status=WORKFLOW_STATUS_COMPLETED,
                        new_version=source_version,
                        id_mappings=None,
                        message=(
                            f"First approved upload: no version bump. "
                            f"Approved ZIP diff was committed at v={source_version}; "
                            f"project status moved to OPEN."
                        ),
                    )
                workflow.logger.info(
                    f"First upload for project '{input.project_id}' "
                    f"(status={current_status}); writing into v={source_version} "
                    f"in place and transitioning project to OPEN."
                )
                await workflow.execute_activity(
                    UPDATE_PROJECT_STATUS,
                    args=(input.project_id, PROJECT_STATUS_OPEN),
                    start_to_close_timeout=timedelta(seconds=30),
                    retry_policy=RETRY_POLICY,
                )
                return CreateProjectVersionOutput(
                    status=WORKFLOW_STATUS_COMPLETED,
                    new_version=source_version,
                    id_mappings=None,
                    message=(
                        f"First upload: no version bump. Files will be ingested "
                        f"at v={source_version}; project status moved to OPEN."
                    ),
                )

            target_version = source_version + 1
            lock_token = await workflow.execute_activity(
                ACQUIRE_PROJECT_VERSION_LOCK,
                args=(input.project_id, source_version, target_version, input.zip_file_id),
                start_to_close_timeout=timedelta(seconds=5),
                retry_policy=RETRY_POLICY,
            )
            project_ctx = current_project_context()
            if project_ctx is not None and (
                project_ctx.project_id != str(input.project_id) or project_ctx.project_version != source_version
            ):
                raise ValueError(
                    "CreateProjectVersionWorkflow project context does not match "
                    f"source version {source_version} for project {input.project_id}"
                )
            excluded_workflow_ids: set[str] = set()
            try:
                info = workflow.info()
            except RuntimeError:
                info = None
            if info is not None:
                excluded_workflow_ids.add(info.workflow_id)
                for execution in (getattr(info, "parent", None), getattr(info, "root", None)):
                    workflow_id = getattr(execution, "workflow_id", None)
                    if workflow_id:
                        excluded_workflow_ids.add(workflow_id)
            await workflow.execute_activity(
                CANCEL_PROJECT_VERSION_WORKFLOWS,
                args=(
                    UUID(project_ctx.project_id) if project_ctx is not None else input.project_id,
                    project_ctx.project_version if project_ctx is not None else source_version,
                    sorted(excluded_workflow_ids),
                ),
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=RETRY_POLICY,
            )

            file_diff = input.file_diff
            if input.zip_file_id is not None:
                await workflow.execute_activity(
                    UPDATE_DMS_ZIP_APPROVAL_STATUS,
                    args=(dms_base_url, input.project_id, input.zip_file_id, "APPROVING"),
                    start_to_close_timeout=timedelta(seconds=5),
                    retry_policy=RETRY_POLICY,
                )
                diff_payload = await workflow.execute_activity(
                    GET_DMS_ZIP_DIFF,
                    args=(dms_base_url, input.project_id, input.zip_file_id, source_version),
                    start_to_close_timeout=timedelta(seconds=5),
                    retry_policy=RETRY_POLICY,
                )
                file_diff = FileDiffSummary.model_validate(diff_payload)

            copy_plan = await workflow.execute_activity(
                BUILD_PROJECT_VERSION_COPY_PLAN,
                args=(
                    [{"service": name, "base_url": url} for name, url in graph_endpoints],
                    input.project_id,
                    source_version,
                    file_diff.model_dump(mode="json"),
                ),
                start_to_close_timeout=BUILD_PROJECT_VERSION_COPY_PLAN_TIMEOUT,
                retry_policy=RETRY_POLICY,
            )
            survivors_per_service = copy_plan["survivors_per_service"]
            deleted_file_ids = copy_plan["deleted_file_ids"]
            deleted_keys_count = copy_plan["deleted_keys_count"]

            dry_run_tasks = [
                workflow.execute_activity(
                    COPY_SERVICE_VERSION_NODES,
                    args=(
                        url,
                        input.project_id,
                        source_version,
                        target_version,
                        lock_token,
                        survivors_per_service.get(name, []),
                        True,
                    ),
                    start_to_close_timeout=COPY_SERVICE_VERSION_NODES_TIMEOUT,
                    retry_policy=RETRY_POLICY,
                )
                for name, url in copy_endpoints
            ]
            if input.zip_file_id is not None:
                dry_run_tasks.append(
                    workflow.execute_activity(
                        COMMIT_DMS_ZIP_DIFF,
                        args=(
                            dms_base_url,
                            input.project_id,
                            input.zip_file_id,
                            source_version,
                            target_version,
                            lock_token,
                            True,
                        ),
                        start_to_close_timeout=DMS_ZIP_DIFF_TIMEOUT,
                        retry_policy=RETRY_POLICY,
                    )
                )
            dry_run_tasks.append(
                workflow.execute_activity(
                    COPY_PROJECT_ROOT_VERSION,
                    args=(input.project_id, source_version, target_version, True),
                    start_to_close_timeout=timedelta(seconds=5),
                    retry_policy=RETRY_POLICY,
                )
            )
            await asyncio.gather(*dry_run_tasks)

            await workflow.execute_activity(
                COPY_PROJECT_ROOT_VERSION,
                args=(input.project_id, source_version, target_version, False),
                start_to_close_timeout=timedelta(seconds=5),
                retry_policy=RETRY_POLICY,
            )
            project_root_committed = True

            for name, url in copy_endpoints:
                await workflow.execute_activity(
                    COPY_SERVICE_VERSION_NODES,
                    args=(
                        url,
                        input.project_id,
                        source_version,
                        target_version,
                        lock_token,
                        survivors_per_service.get(name, []),
                        False,
                    ),
                    start_to_close_timeout=COPY_SERVICE_VERSION_NODES_TIMEOUT,
                    retry_policy=RETRY_POLICY,
                )
                committed_services.add(name)

            if input.zip_file_id is not None:
                dms_commit_started = True
                await workflow.execute_activity(
                    COMMIT_DMS_ZIP_DIFF,
                    args=(
                        dms_base_url,
                        input.project_id,
                        input.zip_file_id,
                        source_version,
                        target_version,
                        lock_token,
                        False,
                    ),
                    start_to_close_timeout=DMS_ZIP_DIFF_TIMEOUT,
                    retry_policy=RETRY_POLICY,
                )

            if deleted_file_ids:
                info = workflow.info()
                qdrant_cleanup_input = QdrantSourceFileCleanupInput(
                    project_id=str(input.project_id),
                    source_file_ids=deleted_file_ids,
                    marker=f"{info.workflow_id}:{info.run_id}:{target_version}",
                    project_version=target_version,
                )
                await execute_qdrant_source_file_cleanup(
                    qdrant_cleanup_input,
                    project_id=str(input.project_id),
                )

            if input.zip_file_id is not None:
                await workflow.execute_activity(
                    UPDATE_DMS_ZIP_APPROVAL_STATUS,
                    args=(dms_base_url, input.project_id, input.zip_file_id, "APPROVED"),
                    start_to_close_timeout=timedelta(seconds=5),
                    retry_policy=RETRY_POLICY,
                )

            await workflow.execute_activity(
                RELEASE_PROJECT_VERSION_LOCK,
                args=(input.project_id, lock_token, None),
                start_to_close_timeout=timedelta(seconds=5),
                retry_policy=RETRY_POLICY,
            )
            lock_token = None

            with use_project_context(input.project_id, target_version):
                await workflow.execute_activity(
                    start_decoupled_parent_workflow,
                    StartDecoupledParentWorkflowInput(
                        workflow_id=FVP_WORKFLOW_ID,
                        workflow_input={"project_id": str(input.project_id)},
                        task_queue=FVP_TASK_QUEUE,
                        project_id=input.project_id,
                        project_version=target_version,
                        id_reuse_policy=WorkflowIDReusePolicy.REJECT_DUPLICATE,
                    ),
                    start_to_close_timeout=timedelta(seconds=30),
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )

            return CreateProjectVersionOutput(
                status=WORKFLOW_STATUS_COMPLETED,
                new_version=target_version,
                id_mappings=None,
                message=f"Version {target_version} created. Cascade-dropped {deleted_keys_count} nodes.",
            )

        except asyncio.CancelledError:
            if target_version is not None and lock_token is not None:
                if qdrant_cleanup_input is not None:
                    await execute_qdrant_source_file_cleanup_compensation(
                        qdrant_cleanup_input,
                        project_id=str(input.project_id),
                    )
                cleanup_tasks = [
                    workflow.execute_activity(
                        UNDO_SERVICE_VERSION,
                        args=(url, input.project_id, target_version, lock_token),
                        start_to_close_timeout=timedelta(seconds=5),
                        retry_policy=CLEANUP_RETRY_POLICY,
                    )
                    for name, url in copy_endpoints
                    if name in committed_services
                ]
                if dms_commit_started:
                    cleanup_tasks.append(
                        workflow.execute_activity(
                            UNDO_SERVICE_VERSION,
                            args=(dms_base_url, input.project_id, target_version, lock_token),
                            start_to_close_timeout=timedelta(seconds=5),
                            retry_policy=CLEANUP_RETRY_POLICY,
                        )
                    )
                if cleanup_tasks:
                    await asyncio.gather(*cleanup_tasks)
                if project_root_committed:
                    await workflow.execute_activity(
                        UNDO_PROJECT_ROOT_VERSION,
                        args=(input.project_id, target_version),
                        start_to_close_timeout=timedelta(seconds=5),
                        retry_policy=CLEANUP_RETRY_POLICY,
                    )
                    project_root_committed = False
            if lock_token is not None:
                await workflow.execute_activity(
                    RELEASE_PROJECT_VERSION_LOCK,
                    args=(input.project_id, lock_token, "Workflow canceled"),
                    start_to_close_timeout=timedelta(seconds=5),
                    retry_policy=CLEANUP_RETRY_POLICY,
                )
            return CreateProjectVersionOutput(
                status=WORKFLOW_STATUS_CANCELED,
                message="Workflow canceled",
            )
        except Exception as exc:
            if target_version is not None and lock_token is not None:
                if qdrant_cleanup_input is not None:
                    await execute_qdrant_source_file_cleanup_compensation(
                        qdrant_cleanup_input,
                        project_id=str(input.project_id),
                    )
                cleanup_tasks = [
                    workflow.execute_activity(
                        UNDO_SERVICE_VERSION,
                        args=(url, input.project_id, target_version, lock_token),
                        start_to_close_timeout=timedelta(seconds=5),
                        retry_policy=CLEANUP_RETRY_POLICY,
                    )
                    for name, url in copy_endpoints
                    if name in committed_services
                ]
                if dms_commit_started:
                    cleanup_tasks.append(
                        workflow.execute_activity(
                            UNDO_SERVICE_VERSION,
                            args=(dms_base_url, input.project_id, target_version, lock_token),
                            start_to_close_timeout=timedelta(seconds=5),
                            retry_policy=CLEANUP_RETRY_POLICY,
                        )
                    )
                if cleanup_tasks:
                    await asyncio.gather(*cleanup_tasks)
                if project_root_committed:
                    await workflow.execute_activity(
                        UNDO_PROJECT_ROOT_VERSION,
                        args=(input.project_id, target_version),
                        start_to_close_timeout=timedelta(seconds=5),
                        retry_policy=CLEANUP_RETRY_POLICY,
                    )
                    project_root_committed = False

            if input.zip_file_id is not None:
                await workflow.execute_activity(
                    UPDATE_DMS_ZIP_APPROVAL_STATUS,
                    args=(dms_base_url, input.project_id, input.zip_file_id, "FAILED_APPROVE", str(exc)),
                    start_to_close_timeout=timedelta(seconds=5),
                    retry_policy=RETRY_POLICY,
                )

            if lock_token is not None:
                await workflow.execute_activity(
                    RELEASE_PROJECT_VERSION_LOCK,
                    args=(input.project_id, lock_token, str(exc)),
                    start_to_close_timeout=timedelta(seconds=5),
                    retry_policy=CLEANUP_RETRY_POLICY,
                )
            workflow.logger.exception(f"CreateProjectVersionWorkflow for project '{input.project_id}' failed: {exc}")
            raise
