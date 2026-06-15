from __future__ import annotations

import asyncio
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any
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

WORKFLOW_STATUS_COMPLETED = "COMPLETED"
WORKFLOW_STATUS_CANCELED = "CANCELED"

PROJECT_STATUS_OPEN = "OPEN"
PROJECT_STATUS_UPLOAD_DOCUMENTS = "UPLOAD_DOCUMENTS"

DOCUMENT_MANAGEMENT_SERVICE = "document_management_service"
PROJECT_LOGIC_SERVICE = "project_logic_service"
EXAMINATION_SERVICE = "examination_service"
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
COPY_SERVICE_VERSION_NODES_TIMEOUT = timedelta(seconds=30)
MVP_STATUS_CHECKED = "checked"
MVP_STATUS_NEEDS_REVISION = "needs_revision"
SATZ_STATUS_CHECKED = "checked"
SATZ_STATUS_NEEDS_REVISION = "needs_revision"


@dataclass(frozen=True)
class NodeKey:
    service: str
    node_type: str
    id: UUID


@dataclass(frozen=True)
class ParentRef:
    service: str
    node_type: str
    id: UUID


@dataclass(frozen=True)
class NodeSummary:
    service: str
    id: UUID
    node_type: str
    parents: tuple[ParentRef, ...] = field(default_factory=tuple)
    frontend_parent_ids: tuple[str, ...] = field(default_factory=tuple)

    @property
    def key(self) -> NodeKey:
        return NodeKey(service=self.service, node_type=self.node_type, id=self.id)


@dataclass
class TopicNormRevisionRequests:
    mvp_topic_norm_ids: set[UUID] = field(default_factory=set)
    rpb_satz_ids_by_topic_norm_id: dict[UUID, set[UUID]] = field(default_factory=lambda: defaultdict(set))
    changed_satz_ids: set[UUID] = field(default_factory=set)


def collect_dependents(
    *,
    roots: Iterable[NodeKey],
    summaries: Iterable[NodeSummary],
) -> set[NodeKey]:
    summaries = list(summaries)
    children_of: dict[NodeKey, list[NodeKey]] = defaultdict(list)
    for summary in summaries:
        for parent in summary.parents:
            children_of[NodeKey(parent.service, parent.node_type, parent.id)].append(summary.key)

    known_keys = {summary.key for summary in summaries}
    visited: set[NodeKey] = set()
    queue: list[NodeKey] = list(roots)
    while queue:
        current = queue.pop()
        if current in visited:
            continue
        visited.add(current)
        for child in children_of.get(current, ()):
            if child not in visited:
                queue.append(child)

    return visited & known_keys


def decode_node_summaries(rows: list[dict[str, Any]]) -> list[NodeSummary]:
    service_by_node_ref = {(row["node_type"], UUID(str(row["id"]))): row["_service"] for row in rows}
    summaries: list[NodeSummary] = []
    for row in rows:
        owning_service = row["_service"]
        parents = tuple(
            ParentRef(
                service=service_by_node_ref[(parent["node_type"], UUID(str(parent["id"])))],
                node_type=parent["node_type"],
                id=UUID(str(parent["id"])),
            )
            for parent in row.get("parents", [])
        )
        summaries.append(
            NodeSummary(
                service=owning_service,
                id=UUID(str(row["id"])),
                node_type=row["node_type"],
                parents=parents,
                frontend_parent_ids=tuple(str(parent_id) for parent_id in row.get("frontend_parent_ids", [])),
            )
        )
    return summaries


def _parent_ids(summary: NodeSummary, *, service: str, node_type: str) -> set[UUID]:
    return {parent.id for parent in summary.parents if parent.service == service and parent.node_type == node_type}


def _first_parent_id(summary: NodeSummary, *, service: str, node_type: str) -> UUID | None:
    return next(iter(_parent_ids(summary, service=service, node_type=node_type)), None)


def _frontend_ref_ids(summary: NodeSummary, node_type: str) -> set[UUID]:
    prefix = f"{node_type}:"
    ids: set[UUID] = set()
    for ref in summary.frontend_parent_ids:
        if ref.startswith(prefix):
            try:
                ids.add(UUID(ref.removeprefix(prefix)))
            except ValueError:
                continue
    return ids


def _file_roots(file_ids: set[UUID]) -> set[NodeKey]:
    return {
        NodeKey(
            service=DOCUMENT_MANAGEMENT_SERVICE,
            node_type="file",
            id=file_id,
        )
        for file_id in file_ids
    }


def _entry_file_ids(entries: Iterable[Any]) -> set[UUID]:
    return {UUID(str(entry.file_id)) for entry in entries}


def _renamed_file_names(file_diff: FileDiffSummary) -> dict[UUID, str]:
    names: dict[UUID, str] = {}
    for entry in file_diff.renamed:
        if entry.target_filename:
            names[UUID(str(entry.file_id))] = entry.target_filename
    return names


def _topic_norm_revision_requests(
    summaries: list[NodeSummary],
    changed_keys: set[NodeKey],
) -> TopicNormRevisionRequests:
    summaries_by_key = {summary.key: summary for summary in summaries}
    requests = TopicNormRevisionRequests()

    changed_topic_ids: set[UUID] = set()
    for summary in summaries:
        if summary.key not in changed_keys:
            continue
        if summary.service == EXAMINATION_SERVICE and summary.node_type == "dokument":
            changed_topic_ids.update(_frontend_ref_ids(summary, "topic"))
        if summary.service == EXAMINATION_SERVICE and summary.node_type == "fundstelle":
            satz_id = _first_parent_id(summary, service=EXAMINATION_SERVICE, node_type="satz")
            norm_id = _first_parent_id(summary, service=EXAMINATION_SERVICE, node_type="norm")
            if satz_id is None or norm_id is None:
                continue
            requests.changed_satz_ids.add(satz_id)
            norm_summary = summaries_by_key.get(NodeKey(EXAMINATION_SERVICE, "norm", norm_id))
            if norm_summary is None:
                continue
            for topic_norm_id in _frontend_ref_ids(norm_summary, "topic_norm"):
                requests.rpb_satz_ids_by_topic_norm_id[topic_norm_id].add(satz_id)

    for summary in summaries:
        if summary.service != PROJECT_LOGIC_SERVICE or summary.node_type != "topic_norm":
            continue
        topic_ids = _parent_ids(summary, service=PROJECT_LOGIC_SERVICE, node_type="topic")
        if topic_ids & changed_topic_ids:
            requests.mvp_topic_norm_ids.add(summary.id)

    return requests


def _topic_norm_payloads_by_id(rows: list[dict[str, Any]]) -> dict[UUID, dict[str, Any]]:
    payloads: dict[UUID, dict[str, Any]] = {}
    for row in rows:
        payload_id = row.get("id")
        if payload_id is not None:
            payloads[UUID(str(payload_id))] = row
    return payloads


def _topic_norm_overrides(
    *,
    topic_norm_id: UUID,
    payloads_by_id: dict[UUID, dict[str, Any]],
    requests: TopicNormRevisionRequests,
) -> dict[str, Any]:
    payload = payloads_by_id.get(topic_norm_id, {})
    overrides: dict[str, Any] = {}

    if topic_norm_id in requests.mvp_topic_norm_ids and payload.get("mvp_status") == MVP_STATUS_CHECKED:
        overrides["mvp_status"] = MVP_STATUS_NEEDS_REVISION

    satz_ids = requests.rpb_satz_ids_by_topic_norm_id.get(topic_norm_id, set())
    if satz_ids:
        satz_statuses = dict(payload.get("satz_statuses") or {})
        changed = False
        for satz_id in satz_ids:
            key = str(satz_id)
            if satz_statuses.get(key) == SATZ_STATUS_CHECKED:
                satz_statuses[key] = SATZ_STATUS_NEEDS_REVISION
                changed = True
        if changed:
            overrides["satz_statuses"] = satz_statuses

    return overrides


def build_copy_nodes_by_service(
    *,
    summaries: list[NodeSummary],
    deleted_keys: set[NodeKey],
    changed_keys: set[NodeKey],
    renamed_file_names: dict[UUID, str],
    topic_norm_payloads_by_id: dict[UUID, dict[str, Any]],
    topic_norm_revision_requests: TopicNormRevisionRequests,
) -> dict[str, list[dict[str, Any]]]:
    nodes_by_service: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for summary in summaries:
        if summary.service == DOCUMENT_MANAGEMENT_SERVICE or summary.key in deleted_keys:
            continue

        overrides: dict[str, Any] = {}
        set_outdated = False
        if summary.service == EXAMINATION_SERVICE:
            if summary.key in changed_keys and summary.node_type in {"dokument", "fundstelle"}:
                set_outdated = True
            if summary.node_type == "bewertung":
                satz_ids = _parent_ids(summary, service=EXAMINATION_SERVICE, node_type="satz")
                set_outdated = bool(satz_ids & topic_norm_revision_requests.changed_satz_ids)
            if summary.node_type == "dokument":
                dms_file_id = _first_parent_id(
                    summary,
                    service=DOCUMENT_MANAGEMENT_SERVICE,
                    node_type="file",
                )
                if dms_file_id in renamed_file_names:
                    overrides["filename"] = renamed_file_names[dms_file_id]

        if summary.service == PROJECT_LOGIC_SERVICE and summary.node_type == "topic_norm":
            overrides.update(
                _topic_norm_overrides(
                    topic_norm_id=summary.id,
                    payloads_by_id=topic_norm_payloads_by_id,
                    requests=topic_norm_revision_requests,
                )
            )

        node: dict[str, Any] = {"node_type": summary.node_type, "id": str(summary.id)}
        if set_outdated:
            node["set_outdated"] = True
        if overrides:
            node["overrides"] = overrides
        nodes_by_service[summary.service].append(node)
    return nodes_by_service


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

            list_tasks = [
                workflow.execute_activity(
                    LIST_SERVICE_NODES,
                    args=(url, name, input.project_id, source_version),
                    start_to_close_timeout=timedelta(minutes=10),
                    retry_policy=RETRY_POLICY,
                )
                for name, url in graph_endpoints
            ]
            raw_rows_per_service = await asyncio.gather(*list_tasks)
            all_rows = [row for rows in raw_rows_per_service for row in rows]
            summaries = decode_node_summaries(all_rows)

            deleted_keys = collect_dependents(
                roots=_file_roots(_entry_file_ids(file_diff.deleted)),
                summaries=summaries,
            )
            changed_keys = collect_dependents(
                roots=_file_roots(_entry_file_ids(file_diff.changed)),
                summaries=summaries,
            )
            topic_norm_revision_requests = _topic_norm_revision_requests(summaries, changed_keys | deleted_keys)

            topic_norm_payload_rows: list[dict[str, Any]] = []
            topic_norm_ids = set(topic_norm_revision_requests.mvp_topic_norm_ids)
            topic_norm_ids.update(topic_norm_revision_requests.rpb_satz_ids_by_topic_norm_id.keys())
            if topic_norm_ids:
                topic_norm_payload_rows = await workflow.execute_activity(
                    BATCH_GET_SERVICE_NODES,
                    args=(
                        endpoint_by_service[PROJECT_LOGIC_SERVICE],
                        PROJECT_LOGIC_SERVICE,
                        input.project_id,
                        source_version,
                        [
                            {"node_type": "topic_norm", "id": str(topic_norm_id)}
                            for topic_norm_id in sorted(topic_norm_ids, key=str)
                        ],
                    ),
                    start_to_close_timeout=timedelta(minutes=10),
                    retry_policy=RETRY_POLICY,
                )

            survivors_per_service = build_copy_nodes_by_service(
                summaries=summaries,
                deleted_keys=deleted_keys,
                changed_keys=changed_keys,
                renamed_file_names=_renamed_file_names(file_diff),
                topic_norm_payloads_by_id=_topic_norm_payloads_by_id(topic_norm_payload_rows),
                topic_norm_revision_requests=topic_norm_revision_requests,
            )

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

            deleted_file_ids = [str(file_id) for file_id in _entry_file_ids(file_diff.deleted)]
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
                message=f"Version {target_version} created. Cascade-dropped {len(deleted_keys)} nodes.",
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
