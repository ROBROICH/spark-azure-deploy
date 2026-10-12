from collections.abc import Awaitable, Callable
from datetime import timedelta
from types import SimpleNamespace
from typing import cast

import pytest
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.testclient import TestClient
from pydantic import BaseModel
from temporal.registry import WorkflowDefinition, WorkflowName
from temporal.schedule_router import DEFAULT_PAUSE_NOTE, build_schedule, create_schedule_router
from temporalio.client import (
    Client,
    Schedule,
    ScheduleActionStartWorkflow,
    ScheduleUpdate,
    ScheduleUpdateInput,
)
from temporalio.service import RPCError, RPCStatusCode

SCHEDULE_ID = "test-schedule"
WORKFLOW = WorkflowDefinition(WorkflowName("TestWorkflow"), "test-queue")


class ExampleInput(BaseModel):
    source: str


class CreateScheduleRequest(BaseModel):
    input: ExampleInput
    intervals: list[timedelta]
    note: str | None = None


class UpdateScheduleRequest(BaseModel):
    input: ExampleInput | None = None
    intervals: list[timedelta] | None = None
    note: str | None = None


class PauseScheduleRequest(BaseModel):
    note: str | None = None


def _rpc_error(code: RPCStatusCode) -> RPCError:
    return RPCError("rpc failed: internal detail", code, b"")


class FakeHandle:
    def __init__(self, existing: Schedule | None, error: BaseException | None) -> None:
        self.existing = existing
        self.error = error
        self.updated: ScheduleUpdate | None = None
        self.paused_note: str | None = None
        self.deleted = False

    async def update(self, updater: Callable[[ScheduleUpdateInput], Awaitable[ScheduleUpdate]]) -> None:
        if self.error is not None:
            raise self.error
        update_input = cast(ScheduleUpdateInput, SimpleNamespace(description=SimpleNamespace(schedule=self.existing)))
        self.updated = await updater(update_input)

    async def pause(self, *, note: str | None = None) -> None:
        if self.error is not None:
            raise self.error
        self.paused_note = note

    async def delete(self) -> None:
        if self.error is not None:
            raise self.error
        self.deleted = True


class FakeClient:
    def __init__(self, error: BaseException | None = None, existing: Schedule | None = None) -> None:
        self.error = error
        self.created: list[tuple[str, Schedule]] = []
        self.handle = FakeHandle(existing, error)
        self.handle_ids: list[str] = []

    async def create_schedule(self, schedule_id: str, schedule: Schedule) -> None:
        if self.error is not None:
            raise self.error
        self.created.append((schedule_id, schedule))

    def get_schedule_handle(self, schedule_id: str) -> FakeHandle:
        self.handle_ids.append(schedule_id)
        return self.handle


def _make_app(fake: FakeClient, *, allow: bool = True) -> FastAPI:
    async def get_client() -> Client:
        return cast(Client, fake)

    async def guard() -> None:
        if not allow:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="forbidden")

    app = FastAPI()
    app.include_router(
        create_schedule_router(
            schedule_id=SCHEDULE_ID,
            workflow=WORKFLOW,
            create_request_model=CreateScheduleRequest,
            update_request_model=UpdateScheduleRequest,
            pause_request_model=PauseScheduleRequest,
            get_client=get_client,
            dependencies=[Depends(guard)],
        )
    )
    return app


def _client(fake: FakeClient, *, allow: bool = True) -> TestClient:
    return TestClient(_make_app(fake, allow=allow), raise_server_exceptions=False)


def test_build_schedule_starts_workflow_with_single_input_argument() -> None:
    schedule = build_schedule(WORKFLOW, input=["a"], intervals=[timedelta(days=1)], note="n")

    action = schedule.action
    assert isinstance(action, ScheduleActionStartWorkflow)
    assert action.workflow == WORKFLOW.name
    assert action.id == WORKFLOW.name
    assert action.task_queue == WORKFLOW.task_queue
    assert action.args == [["a"]]
    assert [i.every for i in schedule.spec.intervals] == [timedelta(days=1)]
    assert schedule.state.note == "n"


def test_create_schedule_creates_configured_schedule() -> None:
    fake = FakeClient()

    response = _client(fake).post(
        "/temporal/schedule", json={"input": {"source": "bund"}, "intervals": ["P7D"], "note": "hello"}
    )

    assert response.status_code == status.HTTP_201_CREATED
    [(schedule_id, schedule)] = fake.created
    assert schedule_id == SCHEDULE_ID
    assert isinstance(schedule.action, ScheduleActionStartWorkflow)
    assert schedule.action.args == [ExampleInput(source="bund")]
    assert [i.every for i in schedule.spec.intervals] == [timedelta(days=7)]
    assert schedule.state.note == "hello"


def test_create_schedule_rejects_invalid_body_with_service_model() -> None:
    response = _client(FakeClient()).post("/temporal/schedule", json={"intervals": ["P7D"]})

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


def test_create_schedule_maps_already_exists_to_409() -> None:
    response = _client(FakeClient(error=_rpc_error(RPCStatusCode.ALREADY_EXISTS))).post(
        "/temporal/schedule", json={"input": {"source": "bund"}, "intervals": ["P1D"]}
    )

    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.json() == {"detail": "Schedule already exists"}


@pytest.mark.parametrize("error", [_rpc_error(RPCStatusCode.UNAVAILABLE), RuntimeError("secret internal detail")])
def test_create_schedule_does_not_leak_unexpected_error_text(error: BaseException) -> None:
    response = _client(FakeClient(error=error)).post(
        "/temporal/schedule", json={"input": {"source": "bund"}, "intervals": ["P1D"]}
    )

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert "detail" not in response.text


def test_update_schedule_applies_only_given_fields() -> None:
    existing = build_schedule(WORKFLOW, input=ExampleInput(source="old"), intervals=[timedelta(days=1)], note="old")
    fake = FakeClient(existing=existing)

    response = _client(fake).put("/temporal/schedule", json={"input": {"source": "new"}, "intervals": ["PT1H"]})

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert fake.handle_ids == [SCHEDULE_ID]
    assert fake.handle.updated is not None
    schedule = fake.handle.updated.schedule
    assert isinstance(schedule.action, ScheduleActionStartWorkflow)
    assert schedule.action.args == [ExampleInput(source="new")]
    assert [i.every for i in schedule.spec.intervals] == [timedelta(hours=1)]
    assert schedule.state.note == "old"


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("PUT", "/temporal/schedule", {"note": "x"}),
        ("POST", "/temporal/schedule/pause", {}),
        ("DELETE", "/temporal/schedule", None),
    ],
)
def test_handle_routes_map_not_found_to_404(method: str, path: str, body: dict[str, str] | None) -> None:
    response = _client(FakeClient(error=_rpc_error(RPCStatusCode.NOT_FOUND))).request(method, path, json=body)

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json() == {"detail": "Schedule not found"}


def test_pause_schedule_uses_default_note() -> None:
    fake = FakeClient()

    response = _client(fake).post("/temporal/schedule/pause", json={})

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert fake.handle.paused_note == DEFAULT_PAUSE_NOTE


def test_delete_schedule_deletes_configured_schedule() -> None:
    fake = FakeClient()

    response = _client(fake).delete("/temporal/schedule")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert fake.handle_ids == [SCHEDULE_ID]
    assert fake.handle.deleted


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("POST", "/temporal/schedule", {"input": {"source": "bund"}, "intervals": ["P1D"]}),
        ("PUT", "/temporal/schedule", {}),
        ("POST", "/temporal/schedule/pause", {}),
        ("DELETE", "/temporal/schedule", None),
    ],
)
def test_router_dependencies_guard_every_route(method: str, path: str, body: dict[str, object] | None) -> None:
    fake = FakeClient()

    response = _client(fake, allow=False).request(method, path, json=body)

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert fake.created == []
    assert fake.handle_ids == []


def test_openapi_uses_service_request_models() -> None:
    schema = _make_app(FakeClient()).openapi()

    create_body = schema["paths"]["/temporal/schedule"]["post"]["requestBody"]["content"]["application/json"]["schema"]
    update_body = schema["paths"]["/temporal/schedule"]["put"]["requestBody"]["content"]["application/json"]["schema"]
    pause_body = schema["paths"]["/temporal/schedule/pause"]["post"]["requestBody"]["content"]["application/json"]
    assert create_body == {"$ref": "#/components/schemas/CreateScheduleRequest"}
    assert update_body == {"$ref": "#/components/schemas/UpdateScheduleRequest"}
    assert pause_body["schema"] == {"$ref": "#/components/schemas/PauseScheduleRequest"}
