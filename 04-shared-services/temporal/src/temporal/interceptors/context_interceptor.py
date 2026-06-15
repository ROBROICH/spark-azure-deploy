from __future__ import annotations

import dataclasses
from typing import Any
from uuid import UUID

from audit_client.forwarding import (
    actor_user_id_ctx,
    audit_headers_ctx,
    bearer_token_ctx,
    set_audit_headers_context,
)
from audit_client.workflow import WorkflowActorContext
from temporalio import activity as _activity
from temporalio import workflow as _workflow
from temporalio.api.common.v1 import Payload
from temporalio.client import Interceptor as ClientInterceptor
from temporalio.client import OutboundInterceptor, StartWorkflowInput
from temporalio.converter import PayloadConverter
from temporalio.worker import (
    ActivityInboundInterceptor,
    ExecuteActivityInput,
    StartActivityInput,
    StartChildWorkflowInput,
    StartLocalActivityInput,
    WorkflowInboundInterceptor,
    WorkflowInterceptorClassInput,
    WorkflowOutboundInterceptor,
)
from temporalio.worker import Interceptor as WorkerInterceptor

from temporal.project_context import (
    PROJECT_CONTEXT_HEADER_KEY,
    PROJECT_ID_SEARCH_ATTRIBUTE,
    PROJECT_VERSION_SEARCH_ATTRIBUTE,
    ProjectContext,
    current_project_context,
    merge_project_search_attributes,
    project_context,
)

BEARER_TOKEN_HEADER = "x-bearer-token"
ACTOR_USER_ID_HEADER = "x-actor-user-id"
ROOT_RUN_ID_HEADER = "x-root-run-id"


def encode_bearer_token(token: str) -> Payload:
    return Payload(data=token.encode())


def decode_bearer_token(headers: dict[str, Payload]) -> str | None:
    payload = headers.get(BEARER_TOKEN_HEADER)
    if payload is None:
        return None
    return payload.data.decode() if payload.data else None


def encode_actor_user_id(user_id: UUID) -> Payload:
    return Payload(data=str(user_id).encode())


def decode_actor_user_id(headers: dict[str, Payload]) -> UUID | None:
    payload = headers.get(ACTOR_USER_ID_HEADER)
    if payload is None:
        return None
    raw = payload.data.decode() if payload.data else None
    if not raw:
        return None
    try:
        return UUID(raw)
    except ValueError:
        return None


def encode_root_run_id(run_id: str) -> Payload:
    return Payload(data=run_id.encode())


def decode_root_run_id(headers: dict[str, Payload]) -> str | None:
    payload = headers.get(ROOT_RUN_ID_HEADER)
    if payload is None:
        return None
    return payload.data.decode() if payload.data else None


def _current_root_run_id() -> str | None:
    try:
        info = _workflow.info()
    except Exception:
        return None
    return info.root.run_id if info.root else info.run_id


def _inject_headers(
    headers: dict[str, Payload],
    payload_converter: PayloadConverter,
    token: str | None,
    actor_user_id: UUID | None,
    project_ctx: ProjectContext | None,
) -> dict[str, Payload]:
    result = dict(headers)
    if token:
        result[BEARER_TOKEN_HEADER] = encode_bearer_token(token)
    if actor_user_id:
        result[ACTOR_USER_ID_HEADER] = encode_actor_user_id(actor_user_id)
    if project_ctx is not None:
        result[PROJECT_CONTEXT_HEADER_KEY] = payload_converter.to_payload(project_ctx)
    return result


def _read_project_context(headers: dict[str, Payload], payload_converter: PayloadConverter) -> ProjectContext | None:
    payload = headers.get(PROJECT_CONTEXT_HEADER_KEY)
    if payload is None:
        return None
    return payload_converter.from_payload(payload, ProjectContext)


class _ContextClientOutboundInterceptor(OutboundInterceptor):
    def __init__(self, next: OutboundInterceptor, payload_converter: PayloadConverter) -> None:
        super().__init__(next)
        self._payload_converter = payload_converter

    async def start_workflow(self, input: StartWorkflowInput) -> Any:
        project_ctx = current_project_context()
        input.headers = _inject_headers(
            dict(input.headers or {}),
            self._payload_converter,
            token=bearer_token_ctx.get(),
            actor_user_id=actor_user_id_ctx.get(),
            project_ctx=project_ctx,
        )
        if project_ctx is not None:
            input.search_attributes = merge_project_search_attributes(
                input.search_attributes,
                project_id=project_ctx.project_id,
                project_version=project_ctx.project_version,
            )
        return await super().start_workflow(input)


class _ContextWorkflowOutboundInterceptor(WorkflowOutboundInterceptor):
    def __init__(
        self,
        next_interceptor: WorkflowOutboundInterceptor,
        payload_converter: PayloadConverter,
        token_holder: list[str | None],
        actor_user_id_holder: list[UUID | None],
    ) -> None:
        super().__init__(next_interceptor)
        self._payload_converter = payload_converter
        self._token_holder = token_holder
        self._actor_user_id_holder = actor_user_id_holder

    def _inject(self, headers: dict[str, Payload]) -> dict[str, Payload]:
        result = _inject_headers(
            headers,
            self._payload_converter,
            token=self._token_holder[0],
            actor_user_id=self._actor_user_id_holder[0],
            project_ctx=current_project_context(),
        )

        root_run_id = _current_root_run_id()
        if root_run_id:
            result[ROOT_RUN_ID_HEADER] = encode_root_run_id(root_run_id)
        return result

    def start_activity(self, input: StartActivityInput) -> Any:
        activity_input = dataclasses.replace(input, headers=self._inject(input.headers))
        return self.next.start_activity(activity_input)

    def start_local_activity(self, input: StartLocalActivityInput) -> Any:
        activity_input = dataclasses.replace(input, headers=self._inject(input.headers))
        return self.next.start_local_activity(activity_input)

    def start_child_workflow(self, input: StartChildWorkflowInput) -> Any:
        project_ctx = current_project_context()
        workflow_input = dataclasses.replace(input, headers=self._inject(input.headers))
        if project_ctx is not None:
            workflow_input = dataclasses.replace(
                workflow_input,
                search_attributes=merge_project_search_attributes(
                    workflow_input.search_attributes,
                    project_id=project_ctx.project_id,
                    project_version=project_ctx.project_version,
                ),
            )
        return self.next.start_child_workflow(workflow_input)


def _workflow_inbound_interceptor_class(
    payload_converter: PayloadConverter,
) -> type[WorkflowInboundInterceptor]:
    class _ContextWorkflowInboundInterceptor(WorkflowInboundInterceptor):
        def init(self, outbound: WorkflowOutboundInterceptor) -> None:
            self._token_holder: list[str | None] = [None]
            self._actor_user_id_holder: list[UUID | None] = [None]
            self.next.init(
                _ContextWorkflowOutboundInterceptor(
                    outbound, payload_converter, self._token_holder, self._actor_user_id_holder
                )
            )

        async def execute_workflow(self, input: Any) -> Any:
            self._token_holder[0] = decode_bearer_token(input.headers)
            self._actor_user_id_holder[0] = decode_actor_user_id(input.headers)
            project_ctx = _read_project_context(input.headers, payload_converter)
            if project_ctx is None:
                search_attributes = _workflow.info().typed_search_attributes
                project_id = search_attributes.get(PROJECT_ID_SEARCH_ATTRIBUTE)
                project_version = search_attributes.get(PROJECT_VERSION_SEARCH_ATTRIBUTE)
                if project_id is not None and project_version is not None:
                    project_ctx = ProjectContext(project_id=str(project_id), project_version=project_version)
            if project_ctx is None:
                return await self.next.execute_workflow(input)
            token = project_context.set(project_ctx)
            try:
                return await self.next.execute_workflow(input)
            finally:
                project_context.reset(token)

    return _ContextWorkflowInboundInterceptor


class _ContextActivityInboundInterceptor(ActivityInboundInterceptor):
    def __init__(self, next: ActivityInboundInterceptor, payload_converter: PayloadConverter) -> None:
        super().__init__(next)
        self._payload_converter = payload_converter

    async def execute_activity(self, input: ExecuteActivityInput) -> Any:
        token = decode_bearer_token(input.headers)
        actor_user_id = decode_actor_user_id(input.headers)
        project_ctx = _read_project_context(input.headers, self._payload_converter)
        root_run_id = decode_root_run_id(input.headers)

        info = _activity.info()
        workflow_actor = WorkflowActorContext(
            triggered_by_user_id=actor_user_id,
            workflow_type=info.workflow_type,
        )

        audit_run_id = root_run_id or info.workflow_run_id

        token_ctx = bearer_token_ctx.set(token)
        actor_ctx = actor_user_id_ctx.set(actor_user_id)
        project_token = project_context.set(project_ctx) if project_ctx is not None else None
        audit_token = set_audit_headers_context(workflow_actor, workflow_run_id=audit_run_id)
        try:
            return await self.next.execute_activity(input)
        finally:
            bearer_token_ctx.reset(token_ctx)
            actor_user_id_ctx.reset(actor_ctx)
            if project_token is not None:
                project_context.reset(project_token)
            audit_headers_ctx.reset(audit_token)


class ContextInterceptor(ClientInterceptor, WorkerInterceptor):
    def __init__(self, payload_converter: PayloadConverter) -> None:
        self._payload_converter = payload_converter

    def intercept_client(self, next: OutboundInterceptor) -> OutboundInterceptor:
        return _ContextClientOutboundInterceptor(next, self._payload_converter)

    def intercept_activity(self, next: ActivityInboundInterceptor) -> ActivityInboundInterceptor:
        return _ContextActivityInboundInterceptor(next, self._payload_converter)

    def workflow_interceptor_class(self, input: WorkflowInterceptorClassInput) -> type[WorkflowInboundInterceptor]:
        return _workflow_inbound_interceptor_class(self._payload_converter)
