import logging

from temporalio.client import (
    Client,
    Schedule,
    ScheduleActionStartWorkflow,
    ScheduleAlreadyRunningError,
    ScheduleSpec,
    ScheduleUpdate,
    ScheduleUpdateInput,
)

from src.services.workflows.archival import WeeklyArchivalWorkflow
from src.services.workflows.workflow_models import WeeklyArchivalInput

logger = logging.getLogger("temporal_job_service.archival.schedule")


def _build_schedule(
    workflow_id: str,
    task_queue: str,
    cron: str,
    batch_size: int,
) -> Schedule:
    return Schedule(
        action=ScheduleActionStartWorkflow(
            WeeklyArchivalWorkflow.run,
            WeeklyArchivalInput(batch_size=batch_size),
            id=workflow_id,
            task_queue=task_queue,
        ),
        spec=ScheduleSpec(cron_expressions=[cron]),
    )


async def ensure_archival_schedule(
    temporal_client: Client,
    schedule_id: str,
    workflow_id: str,
    task_queue: str,
    cron: str,
    batch_size: int,
) -> None:
    """Idempotently create the archival Temporal Schedule.

    The Schedule API holds the cron expression on the server. Each fire
    starts a fresh `WeeklyArchivalWorkflow` execution on the given task
    queue. If a schedule with the same id already exists, we update it so
    that env-driven config (cron expression, batch size, etc.) takes
    effect on the next restart.
    """
    schedule = _build_schedule(
        workflow_id=workflow_id,
        task_queue=task_queue,
        cron=cron,
        batch_size=batch_size,
    )
    try:
        await temporal_client.create_schedule(schedule_id, schedule)
        logger.info(
            "created archival schedule id=%s cron=%s queue=%s",
            schedule_id,
            cron,
            task_queue,
        )
        return
    except ScheduleAlreadyRunningError:
        pass

    handle = temporal_client.get_schedule_handle(schedule_id)

    async def _update(_: ScheduleUpdateInput) -> ScheduleUpdate:
        return ScheduleUpdate(schedule=schedule)

    await handle.update(_update)
    logger.info(
        "updated existing archival schedule id=%s cron=%s queue=%s",
        schedule_id,
        cron,
        task_queue,
    )
