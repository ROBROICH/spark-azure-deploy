"""Temporal schedule management routes (admin only)."""

from authentification.dependencies import require_role
from authentification.enums import OidcRoles
from fastapi import Depends
from temporal.registry import BEGRUENDUNGEN_UPDATE_WORKFLOW
from temporal.schedule_router import create_schedule_router
from temporal.worker import get_temporal_client
from temporalio.client import Client

from begruendungen_db.config import app_config
from begruendungen_db.schemas.api import (
    CreateScheduleRequest,
    PauseScheduleRequest,
    UpdateScheduleRequest,
)

BEGRUENDUNGEN_SCHEDULE_ID = "update-begruendungen-schedule"


async def _get_temporal_client() -> Client:
    return await get_temporal_client(host=app_config.temporal.HOST)


temporal_router = create_schedule_router(
    schedule_id=BEGRUENDUNGEN_SCHEDULE_ID,
    workflow=BEGRUENDUNGEN_UPDATE_WORKFLOW,
    create_request_model=CreateScheduleRequest,
    update_request_model=UpdateScheduleRequest,
    pause_request_model=PauseScheduleRequest,
    get_client=_get_temporal_client,
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.ADMIN]))],
)
