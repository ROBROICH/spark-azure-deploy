"""Temporal schedule management routes (admin only)."""

from typing import Annotated

from authentification.dependencies import require_role
from authentification.enums import OidcRoles
from fastapi import APIRouter, Depends, HTTPException, status
from temporalio.client import (
    Client,
    Schedule,
    ScheduleActionStartWorkflow,
    ScheduleIntervalSpec,
    ScheduleSpec,
    ScheduleState,
    ScheduleUpdate,
    ScheduleUpdateInput,
)
from temporalio.service import RPCError, RPCStatusCode

from temporal.worker import get_temporal_client
from temporal.workflows.begruendungen.update_begruendungen import (
    TASK_QUEUE,
    UPDATE_BEGRUENDUNGEN_WORKFLOW_ID,
)

from begruendungen_db.config import app_config
from begruendungen_db.schemas.api import (
    CreateScheduleRequest,
    PauseScheduleRequest,
    UpdateScheduleRequest,
)

BEGRUENDUNGEN_SCHEDULE_ID = "update-begruendungen-schedule"


async def _get_temporal_client() -> Client:
    return await get_temporal_client(host=app_config.temporal.host)


TemporalClientDep = Annotated[Client, Depends(_get_temporal_client)]

temporal_router = APIRouter(
    prefix="/temporal",
    tags=["temporal"],
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.ADMIN]))],
)


@temporal_router.post("/schedule", status_code=status.HTTP_201_CREATED)
async def create_schedule(
    request: CreateScheduleRequest,
    client: TemporalClientDep,
) -> None:
    try:
        await client.create_schedule(
            BEGRUENDUNGEN_SCHEDULE_ID,
            Schedule(
                action=ScheduleActionStartWorkflow(
                    UPDATE_BEGRUENDUNGEN_WORKFLOW_ID,
                    request.input,
                    id=UPDATE_BEGRUENDUNGEN_WORKFLOW_ID,
                    task_queue=TASK_QUEUE,
                ),
                spec=ScheduleSpec(
                    intervals=[ScheduleIntervalSpec(every=i) for i in request.intervals],
                ),
                state=ScheduleState(note=request.note or ""),
            ),
        )
    except RPCError as e:
        if e.status == RPCStatusCode.ALREADY_EXISTS:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Schedule already exists") from e
        raise
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Unhandled Exception: {e}") from e


@temporal_router.put("/schedule", status_code=status.HTTP_204_NO_CONTENT)
async def update_schedule(
    request: UpdateScheduleRequest,
    client: TemporalClientDep,
) -> None:
    handle = client.get_schedule_handle(BEGRUENDUNGEN_SCHEDULE_ID)

    async def do_update(update_input: ScheduleUpdateInput) -> ScheduleUpdate:
        schedule = update_input.description.schedule
        if request.input is not None and isinstance(schedule.action, ScheduleActionStartWorkflow):
            schedule.action.args = [request.input]
        if request.intervals is not None:
            schedule.spec.intervals = [ScheduleIntervalSpec(every=i) for i in request.intervals]
        if request.note is not None:
            schedule.state.note = request.note
        return ScheduleUpdate(schedule=schedule)

    try:
        await handle.update(do_update)
    except RPCError as e:
        if e.status == RPCStatusCode.NOT_FOUND:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Schedule not found") from e
        raise


@temporal_router.post("/schedule/pause", status_code=status.HTTP_204_NO_CONTENT)
async def pause_schedule(
    request: PauseScheduleRequest,
    client: TemporalClientDep,
) -> None:
    handle = client.get_schedule_handle(BEGRUENDUNGEN_SCHEDULE_ID)
    try:
        await handle.pause(note=request.note or "Paused via admin API")
    except RPCError as e:
        if e.status == RPCStatusCode.NOT_FOUND:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Schedule not found") from e
        raise


@temporal_router.delete("/schedule", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(client: TemporalClientDep) -> None:
    handle = client.get_schedule_handle(BEGRUENDUNGEN_SCHEDULE_ID)
    try:
        await handle.delete()
    except RPCError as e:
        if e.status == RPCStatusCode.NOT_FOUND:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Schedule not found") from e
        raise
