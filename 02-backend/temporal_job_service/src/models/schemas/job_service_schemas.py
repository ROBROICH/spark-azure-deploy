from datetime import datetime
from enum import Enum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from temporalio.client import WorkflowHistory


class ExecutionStatus(str, Enum):
    COMPLETED = "Completed"
    RUNNING = "Running"
    FAILED = "Failed"
    CANCELED = "Canceled"
    TERMINATED = "Terminated"
    TIMED_OUT = "TimedOut"
    CONTINUED_AS_NEW = "ContinuedAsNew"
    ALL = "all"


type TemporalStatus = Literal[
    "running",
    "completed",
    "failed",
    "canceled",
    "terminated",
    "timed_out",
    "continued_as_new",
    "pending",
]


class WorkflowsByTypeQuery(BaseModel):
    workflow_type: str = Field(..., min_length=1, pattern=r"^[A-Za-z0-9_.:-]+$")
    include_children: bool = Field(False)
    project_version: int | None = Field(default=None, ge=1)


class ChildWorkflowInfo(BaseModel):
    workflow_id: str
    workflow_type: str
    status: TemporalStatus
    error: str | None = None
    children: list["ChildWorkflowInfo"] = Field(default_factory=list)


class WorkflowsBase(BaseModel):
    workflow_id: str = Field(...)
    run_id: str = Field(...)
    project_id: UUID | None = Field(default=None)
    project_version: int | None = Field(default=None)
    workflow_type: str = Field(...)
    status: TemporalStatus | None = Field(default=None)
    workflow_start_time: datetime | None = Field(default=None)
    workflow_close_time: datetime | None = Field(default=None)
    children: list[ChildWorkflowInfo] = Field(default_factory=list)


class GetWorkflowsResponse(BaseModel):
    latest_running_workflow_id: str | None = Field(default=None)
    latest_completed_workflow_id: str | None = Field(default=None)
    latest_failed_workflow_id: str | None = Field(default=None)
    latest_canceled_workflow_id: str | None = Field(default=None)
    latest_terminated_workflow_id: str | None = Field(default=None)
    latest_timed_out_workflow_id: str | None = Field(default=None)
    latest_continued_as_new_workflow_id: str | None = Field(default=None)
    retrieved_workflows: int = Field(..., examples=[25])
    workflows: list[WorkflowsBase] = Field(...)


class GetWorkflowsByTypeResponse(BaseModel):
    project_id: UUID = Field(...)
    workflow_type: str = Field(...)
    include_children: bool = Field(...)
    retrieved_workflows: int = Field(..., examples=[25])
    workflows: list[WorkflowsBase] = Field(...)


class GetWorkflowResponse(BaseModel):
    workflow_id: str = Field(...)
    workflow_type: str = Field(...)
    workflow_start_time: datetime | None = Field(default=None)
    workflow_close_time: datetime | None = Field(default=None)
    status: TemporalStatus | None = Field(default=None)
    result: dict[str, Any] | list[Any] | str | float | int | None = Field(default=None)
    children: list[ChildWorkflowInfo] = Field(default_factory=list)


class HistoryNode(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    workflow_id: str = Field(...)
    run_id: str = Field(...)
    history: WorkflowHistory
    children: list["HistoryNode"] = Field(default_factory=list)


class GetWorkflowExecutionTreeResponse(BaseModel):
    type: Literal["workflow", "activity"] = Field(..., description="The type of the node")
    name: str = Field(..., description="The name of the workflow or activity")
    id: str = Field(..., description="The id of the workflow or activity")
    status: TemporalStatus = Field(..., description="The status of the workflow or activity")
    error: str | None = Field(default=None, description="The error of the workflow or activity")
    children: list["GetWorkflowExecutionTreeResponse"] = Field(
        default_factory=list, description="The children of the workflow or activity"
    )


class WorkflowTypeLoad(BaseModel):
    workflow_type: str = Field(..., description="The workflow type name")
    running_count: int = Field(..., description="Number of running workflows of this type")
    complexity_weight: float = Field(..., description="Complexity weight for this workflow type")
    total_complexity: float = Field(..., description="running_count * complexity_weight")


class GetSystemLoadResponse(BaseModel):
    load_percentage: float = Field(..., description="Current system load as a percentage (0-100+)")
    running_workflows: int = Field(..., description="Total number of running workflows")
    current_complexity: float = Field(..., description="Sum of complexity across all running workflows")
    max_complexity: float = Field(..., description="Maximum complexity the system can handle")
    breakdown: list[WorkflowTypeLoad] = Field(default_factory=list, description="Load breakdown per workflow type")
