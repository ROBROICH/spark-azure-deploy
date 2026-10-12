from collections.abc import Awaitable, Callable, Sequence
from datetime import timedelta
from typing import Annotated, Protocol

from fastapi import APIRouter, Depends, HTTPException, params, status
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

from temporal.registry import WorkflowDefinition

DEFAULT_PAUSE_NOTE = "Paused via admin API"


class CreateScheduleRequestLike(Protocol):
    @property
    def input(self) -> object: ...

    @property
    def intervals(self) -> list[timedelta]: ...

    @property
    def note(self) -> str | None: ...


class UpdateScheduleRequestLike(Protocol):
    @property
    def input(self) -> object | None: ...

    @property
    def intervals(self) -> list[timedelta] | None: ...

    @property
    def note(self) -> str | None: ...


class PauseScheduleRequestLike(Protocol):
    @property
    def note(self) -> str | None: ...


def build_schedule(
    workflow: WorkflowDefinition,
    input: object,
    intervals: Sequence[timedelta],
    note: str = "",
) -> Schedule:
    return Schedule(
        action=ScheduleActionStartWorkflow(
            workflow.name,
            input,
            id=workflow.name,
            task_queue=workflow.task_queue,
        ),
        spec=ScheduleSpec(
            intervals=[ScheduleIntervalSpec(every=i) for i in intervals],
        ),
        state=ScheduleState(note=note),
    )


def _raise_http_for_rpc_error(error: RPCError, code: RPCStatusCode, http_status: int, detail: str) -> None:
    if error.status == code:
        raise HTTPException(http_status, detail=detail) from error


def create_schedule_router[
    C: CreateScheduleRequestLike,
    U: UpdateScheduleRequestLike,
    P: PauseScheduleRequestLike,
](
    *,
    schedule_id: str,
    workflow: WorkflowDefinition,
    create_request_model: type[C],
    update_request_model: type[U],
    pause_request_model: type[P],
    get_client: Callable[[], Awaitable[Client]],
    dependencies: Sequence[params.Depends],
    prefix: str = "/temporal",
    tags: list[str] | None = None,
) -> APIRouter:
    router = APIRouter(
        prefix=prefix,
        tags=list(tags) if tags is not None else ["temporal"],
        dependencies=list(dependencies),
    )

    async def create_schedule(request: create_request_model, client: Annotated[Client, Depends(get_client)]) -> None:
        try:
            await client.create_schedule(
                schedule_id,
                build_schedule(
                    workflow,
                    input=request.input,
                    intervals=request.intervals,
                    note=request.note or "",
                ),
            )
        except RPCError as e:
            _raise_http_for_rpc_error(
                e, RPCStatusCode.ALREADY_EXISTS, status.HTTP_409_CONFLICT, "Schedule already exists"
            )
            raise

    async def update_schedule(request: update_request_model, client: Annotated[Client, Depends(get_client)]) -> None:
        handle = client.get_schedule_handle(schedule_id)

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
            _raise_http_for_rpc_error(e, RPCStatusCode.NOT_FOUND, status.HTTP_404_NOT_FOUND, "Schedule not found")
            raise

    async def pause_schedule(request: pause_request_model, client: Annotated[Client, Depends(get_client)]) -> None:
        handle = client.get_schedule_handle(schedule_id)
        try:
            await handle.pause(note=request.note or DEFAULT_PAUSE_NOTE)
        except RPCError as e:
            _raise_http_for_rpc_error(e, RPCStatusCode.NOT_FOUND, status.HTTP_404_NOT_FOUND, "Schedule not found")
            raise

    async def delete_schedule(client: Annotated[Client, Depends(get_client)]) -> None:
        handle = client.get_schedule_handle(schedule_id)
        try:
            await handle.delete()
        except RPCError as e:
            _raise_http_for_rpc_error(e, RPCStatusCode.NOT_FOUND, status.HTTP_404_NOT_FOUND, "Schedule not found")
            raise

    router.add_api_route(
        "/schedule",
        create_schedule,
        methods=["POST"],
        status_code=status.HTTP_201_CREATED,
    )
    router.add_api_route(
        "/schedule",
        update_schedule,
        methods=["PUT"],
        status_code=status.HTTP_204_NO_CONTENT,
    )
    router.add_api_route(
        "/schedule/pause",
        pause_schedule,
        methods=["POST"],
        status_code=status.HTTP_204_NO_CONTENT,
    )
    router.add_api_route(
        "/schedule",
        delete_schedule,
        methods=["DELETE"],
        status_code=status.HTTP_204_NO_CONTENT,
    )
    return router
