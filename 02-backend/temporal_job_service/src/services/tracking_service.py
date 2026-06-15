from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db_models import WorkflowExecution, WorkflowStatus
from src.models.schemas.internal_tracking_schemas import StatusRequest


class TrackingService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def update_status(self, req: StatusRequest) -> None:
        terminal_statuses = (
            WorkflowStatus.FAILED,
            WorkflowStatus.COMPLETED,
            WorkflowStatus.TERMINATED,
            WorkflowStatus.CANCELLED,
            WorkflowStatus.TIMED_OUT,
        )
        if req.status in terminal_statuses:
            await self.upsert_terminal(req)
        elif req.status == WorkflowStatus.RUNNING:
            await self.upsert_running(req)
        elif req.status == WorkflowStatus.PENDING:
            await self.upsert_pending(req)
        else:
            raise ValueError(f"invalid status {req.status}")

    async def upsert_pending(self, req: StatusRequest) -> None:
        existing = await self._session.scalar(
            select(WorkflowExecution).where(
                WorkflowExecution.workflow_id == req.workflow_id,
                WorkflowExecution.run_id == req.run_id,
            )
        )
        if existing is None:
            self._session.add(
                WorkflowExecution(
                    workflow_id=req.workflow_id,
                    run_id=req.run_id,
                    workflow_type=req.workflow_type,
                    project_id=req.project_id,
                    project_version=req.project_version,
                    status=WorkflowStatus.PENDING,
                    start_time=req.timestamp,
                )
            )
            await self._session.commit()

    async def upsert_running(self, req: StatusRequest) -> None:
        # Insert as running if the row is missing, otherwise promote pending->running.
        existing = await self._session.scalar(
            select(WorkflowExecution).where(
                WorkflowExecution.workflow_id == req.workflow_id,
                WorkflowExecution.run_id == req.run_id,
            )
        )
        if existing is None:
            self._session.add(
                WorkflowExecution(
                    workflow_id=req.workflow_id,
                    run_id=req.run_id,
                    workflow_type=req.workflow_type,
                    project_id=req.project_id,
                    project_version=req.project_version,
                    status=WorkflowStatus.RUNNING,
                    start_time=req.timestamp,
                )
            )
        elif existing.status == WorkflowStatus.PENDING:
            existing.status = WorkflowStatus.RUNNING
        await self._session.commit()

    async def upsert_terminal(self, req: StatusRequest) -> None:
        existing = await self._session.scalar(
            select(WorkflowExecution).where(
                WorkflowExecution.workflow_id == req.workflow_id,
                WorkflowExecution.run_id == req.run_id,
            )
        )
        if existing is None:
            self._session.add(
                WorkflowExecution(
                    workflow_id=req.workflow_id,
                    run_id=req.run_id,
                    workflow_type=req.workflow_type,
                    project_id=req.project_id,
                    project_version=req.project_version,
                    status=req.status,
                    start_time=req.timestamp,
                    end_time=req.timestamp,
                    failure_message=req.failure_message,
                    history_s3_key=req.history_s3_key,
                )
            )
        else:
            existing.status = req.status
            existing.end_time = req.timestamp
            existing.failure_message = req.failure_message
            existing.history_s3_key = req.history_s3_key
        await self._session.commit()
