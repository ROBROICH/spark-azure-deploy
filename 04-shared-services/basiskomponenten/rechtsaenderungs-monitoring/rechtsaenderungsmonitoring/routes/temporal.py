"""Temporal schedule management routes (admin only)."""

import logging
from datetime import timedelta

from authentification.dependencies import require_role
from authentification.enums import OidcRoles
from fastapi import Depends
from temporal.contracts import MonitorRechtsaenderungenInput, RechtsaenderungenSource
from temporal.registry import RECHTSAENDERUNGS_MONITORING_WORKFLOW
from temporal.schedule_router import build_schedule, create_schedule_router
from temporal.worker import get_temporal_client
from temporalio.client import Client, ScheduleAlreadyRunningError

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
        source=RechtsaenderungenSource.BUND,
        entry_titles=[],
        overwrite=False,
    )
]
DEFAULT_SCHEDULE_INTERVAL = timedelta(days=7)


async def ensure_rechtsaenderungen_schedule(client: Client) -> None:
    """Idempotently create the Rechtsänderungen schedule with the default config.

    Runs on application startup. If a schedule with the same id already exists
    (e.g. it was customized via the admin API), it is left untouched so that
    user-configured intervals/inputs are not overwritten on each restart.
    """
    schedule = build_schedule(
        RECHTSAENDERUNGS_MONITORING_WORKFLOW,
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
    return await get_temporal_client(host=app_config.temporal.HOST)


temporal_router = create_schedule_router(
    schedule_id=RECHTSAENDERUNGEN_SCHEDULE_ID,
    workflow=RECHTSAENDERUNGS_MONITORING_WORKFLOW,
    create_request_model=CreateScheduleRequest,
    update_request_model=UpdateScheduleRequest,
    pause_request_model=PauseScheduleRequest,
    get_client=_get_temporal_client,
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.ADMIN]))],
)
