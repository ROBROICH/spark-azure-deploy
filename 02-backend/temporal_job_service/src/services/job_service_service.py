import logging
from collections import defaultdict
from datetime import datetime
from typing import Any, TypedDict
from uuid import UUID

from temporalio.api.enums.v1.event_type_pb2 import EventType
from temporalio.client import Client

from src.config.settings import settings
from src.models.schemas.job_service_schemas import (
    ChildWorkflowInfo,
    ExecutionStatus,
    GetSystemLoadResponse,
    GetWorkflowExecutionTreeResponse,
    GetWorkflowResponse,
    GetWorkflowsByTypeResponse,
    GetWorkflowsResponse,
    HistoryNode,
    TemporalStatus,
    WorkflowTypeLoad,
)

logger = logging.getLogger(__name__)


class ChildWorkflowState(TypedDict):
    workflow_id: str
    workflow_type: str
    status: TemporalStatus
    error: str | None


class StatusInfo(TypedDict):
    time: datetime | None
    workflow_id: str | None


class JobServiceService:
    @staticmethod
    def _project_id_from_search_attributes(search_attributes: Any) -> str | None:
        if search_attributes and "ProjectId" in search_attributes:
            return search_attributes["ProjectId"][0]
        return None

    @staticmethod
    def _project_version_from_search_attributes(search_attributes: Any) -> int | None:
        if search_attributes and "ProjectVersion" in search_attributes:
            return search_attributes["ProjectVersion"][0]
        return None

    @staticmethod
    async def _get_immediate_children(
        client: Client,
        workflow_id: str,
        run_id: str | None = None,
    ) -> list[ChildWorkflowInfo]:
        handle = client.get_workflow_handle(workflow_id=workflow_id, run_id=run_id)
        wf_history = await handle.fetch_history()
        child_states, _ = JobServiceService._extract_child_workflows(wf_history.events)
        return [ChildWorkflowInfo(**child_states[eid]) for eid in sorted(child_states.keys())]

    @staticmethod
    async def get_workflows_by_type(
        project_id: UUID,
        workflow_type: str,
        include_children: bool,
        temporal_client: Client,
        project_version: int | None = None,
    ) -> GetWorkflowsByTypeResponse:
        workflows = []
        query_parts = [
            "`ParentWorkflowId` IS null",
            f'`ProjectId` = "{project_id}"',
            f'`WorkflowType` = "{workflow_type}"',
        ]
        if project_version is not None:
            query_parts.append(f"`ProjectVersion` = {project_version}")
        query = " AND ".join(query_parts)

        iterator = temporal_client.list_workflows(query)

        async for workflow in iterator:
            children: list[ChildWorkflowInfo] = []
            if include_children:
                try:
                    children = await JobServiceService._get_immediate_children(
                        temporal_client,
                        workflow.id,
                        workflow.run_id,
                    )
                except Exception:
                    logger.warning(
                        "Failed to fetch child workflows for %s",
                        workflow.id,
                        exc_info=True,
                    )

            workflows.append(
                {
                    "workflow_id": workflow.id,
                    "run_id": workflow.run_id,
                    "project_id": JobServiceService._project_id_from_search_attributes(workflow.search_attributes),
                    "project_version": JobServiceService._project_version_from_search_attributes(
                        workflow.search_attributes
                    ),
                    "workflow_type": workflow.workflow_type,
                    "status": workflow.status.name.lower() if workflow.status else None,
                    "workflow_start_time": workflow.start_time,
                    "workflow_close_time": workflow.close_time,
                    "children": children,
                }
            )

        return GetWorkflowsByTypeResponse(
            project_id=project_id,
            workflow_type=workflow_type,
            include_children=include_children,
            retrieved_workflows=len(workflows),
            workflows=workflows,
        )

    @staticmethod
    async def get_workflows(
        execution_status: ExecutionStatus,
        project_id: UUID,
        temporal_client: Client,
        project_version: int | None = None,
    ) -> GetWorkflowsResponse:
        """
        Retrieve a paginated list of Temporal jobs (workflows) with optional filtering.
        """
        latest_status_info: dict[ExecutionStatus, StatusInfo] = {
            status: {"time": None, "workflow_id": None}
            for status in [
                ExecutionStatus.RUNNING,
                ExecutionStatus.COMPLETED,
                ExecutionStatus.FAILED,
                ExecutionStatus.CANCELED,
                ExecutionStatus.TERMINATED,
                ExecutionStatus.TIMED_OUT,
                ExecutionStatus.CONTINUED_AS_NEW,
            ]
        }

        query_parts = ["`ParentWorkflowId` IS null"]
        if execution_status != ExecutionStatus.ALL:
            query_parts.append(f'`ExecutionStatus` = "{execution_status.value}"')
        query_parts.append(f'`ProjectId` = "{project_id}"')
        if project_version is not None:
            query_parts.append(f"`ProjectVersion` = {project_version}")
        query = " AND ".join(query_parts)

        iterator = temporal_client.list_workflows(query)

        workflows = []
        async for workflow in iterator:
            project_id_value = JobServiceService._project_id_from_search_attributes(workflow.search_attributes)

            # Fetch child workflows 2 levels deep
            try:
                tree = await JobServiceService.build_history_tree(temporal_client, workflow.id, max_depth=0)
                children = await JobServiceService._history_to_children(tree)
            except Exception:
                logger.warning("Failed to fetch child workflows for %s", workflow.id, exc_info=True)
                children: list[ChildWorkflowInfo] = []

            partial = {
                "workflow_id": workflow.id,
                "run_id": workflow.run_id,
                "project_id": project_id_value,
                "project_version": JobServiceService._project_version_from_search_attributes(
                    workflow.search_attributes
                ),
                "workflow_type": workflow.workflow_type,
                "status": workflow.status.name.lower() if workflow.status else None,
                "workflow_start_time": workflow.start_time,
                "workflow_close_time": workflow.close_time,
                "children": children,
            }
            workflows.append(partial)
            status_str_lower: str | None = None
            status_str = workflow.status.name if workflow.status is not None else None
            ts = workflow.close_time or workflow.start_time

            if not ts or not status_str:
                continue

            def is_effective_status(enum_value: ExecutionStatus) -> bool:
                return execution_status in {ExecutionStatus.ALL, enum_value}

            if status_str:
                status_str_lower = status_str.lower()

            for status_enum, status_info in latest_status_info.items():
                if status_str_lower == status_enum.value.lower() and is_effective_status(status_enum):
                    current_time = status_info["time"]

                    if current_time is None or ts > current_time:
                        status_info["time"] = ts
                        status_info["workflow_id"] = workflow.id

                    break

        status_to_field = {
            ExecutionStatus.RUNNING: "latest_running_workflow_id",
            ExecutionStatus.COMPLETED: "latest_completed_workflow_id",
            ExecutionStatus.FAILED: "latest_failed_workflow_id",
            ExecutionStatus.CANCELED: "latest_canceled_workflow_id",
            ExecutionStatus.TERMINATED: "latest_terminated_workflow_id",
            ExecutionStatus.TIMED_OUT: "latest_timed_out_workflow_id",
            ExecutionStatus.CONTINUED_AS_NEW: "latest_continued_as_new_workflow_id",
        }

        response_kwargs: dict[str, Any] = {
            field_name: latest_status_info[status_enum]["workflow_id"]
            for status_enum, field_name in status_to_field.items()
        }
        response_kwargs.update(
            {
                "retrieved_workflows": len(workflows),
                "workflows": workflows,
            }
        )

        return GetWorkflowsResponse(**response_kwargs)

    @staticmethod
    async def get_workflow(workflow_id: str, temporal_client: Client) -> GetWorkflowResponse:
        """Get a specific workflow based on its workflow id"""

        handle = temporal_client.get_workflow_handle(workflow_id=workflow_id)
        description = await handle.describe()
        result = None
        if description.close_time:
            result = await handle.result()

        try:
            tree = await JobServiceService.build_history_tree(temporal_client, workflow_id, max_depth=1)
            children = await JobServiceService._history_to_children(tree)
        except Exception:
            logger.warning("Failed to fetch child workflows for %s", workflow_id, exc_info=True)
            children: list[ChildWorkflowInfo] = []

        return GetWorkflowResponse(
            workflow_id=workflow_id,
            workflow_type=description.workflow_type,
            workflow_start_time=description.start_time,
            workflow_close_time=description.close_time,
            status=description.status.name.lower(),
            result=result,
            children=children,
        )

    @staticmethod
    async def build_history_tree(
        client: Client,
        workflow_id: str,
        run_id: str | None = None,
        max_depth: int | None = None,
        _current_depth: int = 0,
    ) -> HistoryNode:
        handle = client.get_workflow_handle(workflow_id, run_id=run_id)
        wf_history = await handle.fetch_history()

        node = HistoryNode(
            workflow_id=workflow_id,
            run_id=handle.run_id or run_id or "unknown",
            history=wf_history,
        )

        if max_depth is not None and _current_depth >= max_depth:
            return node

        for ev in wf_history.events:
            attrs = ev.child_workflow_execution_started_event_attributes
            if not attrs:
                continue

            child_exec = attrs.workflow_execution
            if not child_exec or not child_exec.workflow_id:
                continue
            child_node = await JobServiceService.build_history_tree(
                client,
                child_exec.workflow_id,
                child_exec.run_id,
                max_depth=max_depth,
                _current_depth=_current_depth + 1,
            )
            node.children.append(child_node)

        return node

    @staticmethod
    def _extract_child_workflows(
        events: Any,
    ) -> tuple[dict[int, ChildWorkflowState], dict[str, int]]:
        """Extract child workflow states from history events.

        Returns (child_workflows by initiated_event_id, workflow_id-to-initiated_id mapping).
        """
        child_workflows: dict[int, ChildWorkflowState] = {}
        child_wf_id_to_initiated: dict[str, int] = {}

        for event in events:
            if event.event_type == EventType.EVENT_TYPE_START_CHILD_WORKFLOW_EXECUTION_INITIATED:
                attrs = event.start_child_workflow_execution_initiated_event_attributes
                child_wf_id = attrs.workflow_id
                child_workflows[event.event_id] = {
                    "workflow_id": child_wf_id,
                    "workflow_type": attrs.workflow_type.name,
                    "status": "pending",
                    "error": None,
                }
                child_wf_id_to_initiated[child_wf_id] = event.event_id

            elif event.event_type == EventType.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_STARTED:
                initiated_id = event.child_workflow_execution_started_event_attributes.initiated_event_id
                if initiated_id in child_workflows:
                    child_workflows[initiated_id]["status"] = "running"

            elif event.event_type == EventType.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_COMPLETED:
                initiated_id = event.child_workflow_execution_completed_event_attributes.initiated_event_id
                if initiated_id in child_workflows:
                    child_workflows[initiated_id]["status"] = "completed"

            elif event.event_type == EventType.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_FAILED:
                attrs = event.child_workflow_execution_failed_event_attributes
                if attrs.initiated_event_id in child_workflows:
                    child_workflows[attrs.initiated_event_id]["status"] = "failed"
                    child_workflows[attrs.initiated_event_id]["error"] = attrs.failure.message

            elif event.event_type == EventType.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_CANCELED:
                attrs = event.child_workflow_execution_canceled_event_attributes
                if attrs.initiated_event_id in child_workflows:
                    child_workflows[attrs.initiated_event_id]["status"] = "failed"
                    child_workflows[attrs.initiated_event_id]["error"] = str(attrs.details)

            elif event.event_type == EventType.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_TIMED_OUT:
                initiated_id = event.child_workflow_execution_timed_out_event_attributes.initiated_event_id
                if initiated_id in child_workflows:
                    child_workflows[initiated_id]["status"] = "failed"
                    child_workflows[initiated_id]["error"] = "Child workflow timed out"

            elif event.event_type == EventType.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_TERMINATED:
                initiated_id = event.child_workflow_execution_terminated_event_attributes.initiated_event_id
                if initiated_id in child_workflows:
                    child_workflows[initiated_id]["status"] = "failed"
                    child_workflows[initiated_id]["error"] = "Child workflow terminated"

        return child_workflows, child_wf_id_to_initiated

    @staticmethod
    def _extract_workflow_status(events: Any) -> tuple[str, str, str | None]:
        """Determine the workflow name, status and error from history events."""
        workflow_name = ""
        workflow_status = "running"
        workflow_error: str | None = None

        for event in events:
            event_type = event.event_type

            if event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED:
                workflow_name = event.workflow_execution_started_event_attributes.workflow_type.name
            elif event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED:
                workflow_status = "completed"
            elif event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_FAILED:
                workflow_status = "failed"
                workflow_error = event.workflow_execution_failed_event_attributes.failure.message
            elif event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_CANCELED:
                workflow_status = "failed"
                workflow_error = str(event.workflow_execution_canceled_event_attributes.details)
            elif event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_TERMINATED:
                workflow_status = "failed"
                workflow_error = event.workflow_execution_terminated_event_attributes.reason
            elif event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_TIMED_OUT:
                workflow_status = "failed"
                workflow_error = "Workflow timed out"

        return workflow_name, workflow_status, workflow_error

    @staticmethod
    def _extract_activities(events: Any) -> dict[int, dict[str, Any]]:
        """Build the activity status dict keyed by the scheduled event id."""
        activities: dict[int, dict[str, Any]] = {}

        # Event types that simply transition an activity to a new status.
        simple_status_events = {
            EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED: (
                lambda e: e.activity_task_started_event_attributes.scheduled_event_id,
                "running",
            ),
            EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED: (
                lambda e: e.activity_task_completed_event_attributes.scheduled_event_id,
                "completed",
            ),
        }

        for event in events:
            event_type = event.event_type

            if event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED:
                attrs = event.activity_task_scheduled_event_attributes
                activities[event.event_id] = {
                    "type": "activity",
                    "name": attrs.activity_type.name,
                    "id": attrs.activity_id,
                    "status": "pending",
                    "error": None,
                    "children": [],
                }
            elif event_type in simple_status_events:
                scheduled_id_getter, status = simple_status_events[event_type]
                JobServiceService._set_activity_status(activities, scheduled_id_getter(event), status)
            elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_FAILED:
                attrs = event.activity_task_failed_event_attributes
                JobServiceService._set_activity_status(
                    activities, attrs.scheduled_event_id, "failed", attrs.failure.message
                )
            elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT:
                scheduled_id = event.activity_task_timed_out_event_attributes.scheduled_event_id
                JobServiceService._set_activity_status(activities, scheduled_id, "failed", "Activity timed out")
            elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_CANCELED:
                attrs = event.activity_task_canceled_event_attributes
                JobServiceService._set_activity_status(
                    activities, attrs.scheduled_event_id, "failed", str(attrs.details)
                )

        return activities

    @staticmethod
    def _set_activity_status(
        activities: dict[int, dict[str, Any]],
        scheduled_id: int,
        status: str,
        error: str | None = None,
    ) -> None:
        activity = activities.get(scheduled_id)
        if activity is None:
            return
        activity["status"] = status
        if error is not None:
            activity["error"] = error

    @staticmethod
    def _build_child_wf_dicts(child_states: dict[int, ChildWorkflowState]) -> dict[int, dict[str, Any]]:
        return {
            eid: {
                "type": "workflow",
                "name": state["workflow_type"],
                "id": state["workflow_id"],
                "status": state["status"],
                "error": state["error"],
                "children": [],
            }
            for eid, state in child_states.items()
        }

    @staticmethod
    async def _merge_child_node_statuses(
        node: HistoryNode,
        child_wf_id_to_initiated: dict[str, int],
        child_wf_dicts: dict[int, dict[str, Any]],
    ) -> None:
        """Recurse into child nodes and merge their resolved status into the dicts."""
        for child_node in node.children:
            initiated_id = child_wf_id_to_initiated.get(child_node.workflow_id)
            if initiated_id is None or initiated_id not in child_wf_dicts:
                continue

            child_status = await JobServiceService.history_to_status(child_node)
            child_wf_dicts[initiated_id]["children"] = child_status.get("children", [])
            if child_status.get("status"):
                child_wf_dicts[initiated_id]["status"] = child_status["status"]
            if child_status.get("error"):
                child_wf_dicts[initiated_id]["error"] = child_status["error"]

    @staticmethod
    def _assemble_children(
        activities: dict[int, dict[str, Any]],
        child_wf_dicts: dict[int, dict[str, Any]],
    ) -> list[dict[str, Any]]:
        all_children: list[dict[str, Any]] = []
        for eid in sorted(set(activities.keys()) | set(child_wf_dicts.keys())):
            if eid in activities:
                all_children.append(activities[eid])
            if eid in child_wf_dicts:
                all_children.append(child_wf_dicts[eid])
        return all_children

    @staticmethod
    async def history_to_status(node: HistoryNode) -> dict[str, Any]:
        events = node.history.events

        workflow_name, workflow_status, workflow_error = JobServiceService._extract_workflow_status(events)
        activities = JobServiceService._extract_activities(events)

        child_states, child_wf_id_to_initiated = JobServiceService._extract_child_workflows(events)
        child_wf_dicts = JobServiceService._build_child_wf_dicts(child_states)
        await JobServiceService._merge_child_node_statuses(node, child_wf_id_to_initiated, child_wf_dicts)

        return {
            "type": "workflow",
            "name": workflow_name,
            "id": node.workflow_id,
            "status": workflow_status,
            "error": workflow_error,
            "children": JobServiceService._assemble_children(activities, child_wf_dicts),
        }

    @staticmethod
    async def _history_to_children(node: HistoryNode) -> list[ChildWorkflowInfo]:
        """Extract child workflow info from a HistoryNode."""

        child_states, child_wf_id_to_initiated = JobServiceService._extract_child_workflows(node.history.events)

        for child_node in node.children:
            child_id = child_node.workflow_id
            if child_id in child_wf_id_to_initiated:
                initiated_id = child_wf_id_to_initiated[child_id]
                if initiated_id in child_states:
                    grandchildren = await JobServiceService._history_to_children(child_node)
                    child_states[initiated_id]["children"] = grandchildren

        return [ChildWorkflowInfo(**child_states[eid]) for eid in sorted(child_states.keys())]

    @staticmethod
    async def get_workflow_execution_tree(
        temporal_client: Client, workflow_id: str
    ) -> GetWorkflowExecutionTreeResponse:
        """Get the execution tree of a given workflow using its workflow id"""
        root_node = await JobServiceService.build_history_tree(temporal_client, workflow_id)
        status = await JobServiceService.history_to_status(root_node)
        return GetWorkflowExecutionTreeResponse(**status)

    @staticmethod
    async def get_system_load(temporal_client: Client) -> GetSystemLoadResponse:
        query = '`ExecutionStatus` = "Running" AND `ProjectId` IS NOT null'
        iterator = temporal_client.list_workflows(query)

        counts_by_type: dict[str, int] = defaultdict(int)
        async for workflow in iterator:
            counts_by_type[workflow.workflow_type] += 1

        complexity_config = settings.WORKFLOW_COMPLEXITY
        default_weight = settings.DEFAULT_WORKFLOW_COMPLEXITY_WEIGHT

        breakdown: list[WorkflowTypeLoad] = []
        current_complexity = 0
        running_workflows = 0

        for wf_type, count in sorted(counts_by_type.items()):
            weight = complexity_config.get(wf_type, default_weight)
            type_complexity = count * weight
            current_complexity += type_complexity
            running_workflows += count
            breakdown.append(
                WorkflowTypeLoad(
                    workflow_type=wf_type,
                    running_count=count,
                    complexity_weight=weight,
                    total_complexity=type_complexity,
                )
            )

        max_complexity = settings.MAX_SYSTEM_COMPLEXITY
        load_percentage = round((current_complexity / max_complexity) * 100, 2) if max_complexity > 0 else 0.0

        return GetSystemLoadResponse(
            load_percentage=load_percentage,
            running_workflows=running_workflows,
            current_complexity=current_complexity,
            max_complexity=max_complexity,
            breakdown=breakdown,
        )
