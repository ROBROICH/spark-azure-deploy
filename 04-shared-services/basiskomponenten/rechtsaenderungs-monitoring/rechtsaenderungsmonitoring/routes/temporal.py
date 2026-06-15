"""Temporal schedule management routes (admin only)."""

import logging
from datetime import timedelta
from typing import Annotated

from authentification.dependencies import require_role
from authentification.enums import OidcRoles
from fastapi import APIRouter, Depends, HTTPException, status
from temporal.worker import get_temporal_client
from temporal.workflows.rechtsaenderungs_monitoring.monitor_rechtsaenderungen import (
    MONITOR_RECHTSAENDERUNGEN_WORKFLOW_ID,
    TASK_QUEUE,
)
from temporal.workflows.rechtsaenderungs_monitoring.types import (
    MonitorRechtsaenderungenInput,
    Source,
)
from temporalio.client import (
    Client,
    Schedule,
    ScheduleActionStartWorkflow,
    ScheduleAlreadyRunningError,
    ScheduleIntervalSpec,
    ScheduleSpec,
    ScheduleState,
    ScheduleUpdate,
    ScheduleUpdateInput,
)
from temporalio.service import RPCError, RPCStatusCode

from rechtsaenderungsmonitoring.config import app_config
from rechtsaenderungsmonitoring.schemas.api import (
    CreateScheduleRequest,
    PauseScheduleRequest,
    UpdateScheduleRequest,
)

logger = logging.getLogger(__name__)

RECHTSAENDERUNGEN_SCHEDULE_ID = "monitor-rechtsaenderungen-schedule"

# Default schedule configuration applied on startup if no schedule exists yet.
DEFAULT_SCHEDULE_INPUT = [
    MonitorRechtsaenderungenInput(
        source=Source.BUND,
        entry_titles=[],
        overwrite=False,
    )
]
DEFAULT_SCHEDULE_INTERVAL = timedelta(days=7)


def _build_schedule(
    input: list[MonitorRechtsaenderungenInput],
    intervals: list[timedelta],
    note: str = "",
) -> Schedule:
    return Schedule(
        action=ScheduleActionStartWorkflow(
            MONITOR_RECHTSAENDERUNGEN_WORKFLOW_ID,
            input,
            id=MONITOR_RECHTSAENDERUNGEN_WORKFLOW_ID,
            task_queue=TASK_QUEUE,
        ),
        spec=ScheduleSpec(
            intervals=[ScheduleIntervalSpec(every=i) for i in intervals],
        ),
        state=ScheduleState(note=note),
    )


async def ensure_rechtsaenderungen_schedule(client: Client) -> None:
    """Idempotently create the Rechtsänderungen schedule with the default config.

    Runs on application startup. If a schedule with the same id already exists
    (e.g. it was customized via the admin API), it is left untouched so that
    user-configured intervals/inputs are not overwritten on each restart.
    """
    schedule = _build_schedule(
        input=DEFAULT_SCHEDULE_INPUT,
        intervals=[DEFAULT_SCHEDULE_INTERVAL],
        note="Default Rechtsänderungen monitoring schedule",
    )
    try:
        await client.create_schedule(RECHTSAENDERUNGEN_SCHEDULE_ID, schedule)
        logger.info("created default rechtsaenderungen schedule id=%s", RECHTSAENDERUNGEN_SCHEDULE_ID)
    except ScheduleAlreadyRunningError:
        logger.info(
            "rechtsaenderungen schedule id=%s already exists, leaving it unchanged",
            RECHTSAENDERUNGEN_SCHEDULE_ID,
        )


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
            RECHTSAENDERUNGEN_SCHEDULE_ID,
            _build_schedule(
                input=request.input,
                intervals=request.intervals,
                note=request.note or "",
            ),
        )
    except RPCError as e:
        if e.status == RPCStatusCode.ALREADY_EXISTS:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Schedule already exists") from e
        raise


@temporal_router.put("/schedule", status_code=status.HTTP_204_NO_CONTENT)
async def update_schedule(
    request: UpdateScheduleRequest,
    client: TemporalClientDep,
) -> None:
    handle = client.get_schedule_handle(RECHTSAENDERUNGEN_SCHEDULE_ID)

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
    handle = client.get_schedule_handle(RECHTSAENDERUNGEN_SCHEDULE_ID)
    try:
        await handle.pause(note=request.note or "Paused via admin API")
    except RPCError as e:
        if e.status == RPCStatusCode.NOT_FOUND:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Schedule not found") from e
        raise


@temporal_router.delete("/schedule", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(client: TemporalClientDep) -> None:
    handle = client.get_schedule_handle(RECHTSAENDERUNGEN_SCHEDULE_ID)
    try:
        await handle.delete()
    except RPCError as e:
        if e.status == RPCStatusCode.NOT_FOUND:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Schedule not found") from e
        raise
