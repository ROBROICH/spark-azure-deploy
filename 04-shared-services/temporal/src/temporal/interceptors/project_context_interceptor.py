from __future__ import annotations

from typing import Any

from temporalio.client import Interceptor as ClientInterceptor
from temporalio.client import OutboundInterceptor, StartWorkflowInput
from temporalio.converter import PayloadConverter
from temporalio.worker import (
    ActivityInboundInterceptor,
    ExecuteActivityInput,
    ExecuteWorkflowInput,
    StartActivityInput,
    StartChildWorkflowInput,
    StartLocalActivityInput,
    WorkflowInboundInterceptor,
    WorkflowInterceptorClassInput,
    WorkflowOutboundInterceptor,
)
from temporalio.worker import (
    Interceptor as WorkerInterceptor,
)

from temporal.project_context import (
    PROJECT_CONTEXT_HEADER_KEY,
    ProjectContext,
    current_project_context,
    merge_project_search_attributes,
    project_context,
)


def _headers_with_project_context(input_headers: Any, payload_converter: PayloadConverter) -> dict:
    context = current_project_context()
    if context is None:
        return dict(input_headers or {})
    return {
        **dict(input_headers or {}),
        PROJECT_CONTEXT_HEADER_KEY: payload_converter.to_payload(context),
    }


def _read_project_context(input_headers: Any, payload_converter: PayloadConverter) -> ProjectContext | None:
    payload = (input_headers or {}).get(PROJECT_CONTEXT_HEADER_KEY)
    if payload is None:
        return None
    return payload_converter.from_payload(payload, ProjectContext)


class _ProjectClientOutboundInterceptor(OutboundInterceptor):
    def __init__(self, next: OutboundInterceptor, payload_converter: PayloadConverter) -> None:
        super().__init__(next)
        self._payload_converter = payload_converter

    async def start_workflow(self, input: StartWorkflowInput):
        context = current_project_context()
        if context is not None:
            input.headers = _headers_with_project_context(input.headers, self._payload_converter)
            input.search_attributes = merge_project_search_attributes(
                input.search_attributes,
                project_id=context.project_id,
                project_version=context.project_version,
            )
        return await super().start_workflow(input)


class _ProjectWorkflowOutboundInterceptor(WorkflowOutboundInterceptor):
    def __init__(self, next: WorkflowOutboundInterceptor, payload_converter: PayloadConverter) -> None:
        super().__init__(next)
        self._payload_converter = payload_converter

    def start_activity(self, input: StartActivityInput):
        input.headers = _headers_with_project_context(input.headers, self._payload_converter)
        return self.next.start_activity(input)

    def start_local_activity(self, input: StartLocalActivityInput):
        input.headers = _headers_with_project_context(input.headers, self._payload_converter)
        return self.next.start_local_activity(input)

    def start_child_workflow(self, input: StartChildWorkflowInput):
        context = current_project_context()
        if context is not None:
            input.headers = _headers_with_project_context(input.headers, self._payload_converter)
            input.search_attributes = merge_project_search_attributes(
                input.search_attributes,
                project_id=context.project_id,
                project_version=context.project_version,
            )
        return self.next.start_child_workflow(input)


def _workflow_inbound_interceptor_class(
    payload_converter: PayloadConverter,
) -> type[WorkflowInboundInterceptor]:
    class _ProjectWorkflowInboundInterceptor(WorkflowInboundInterceptor):
        def init(self, outbound: WorkflowOutboundInterceptor) -> None:
            self.next.init(_ProjectWorkflowOutboundInterceptor(outbound, payload_converter))

        async def execute_workflow(self, input: ExecuteWorkflowInput) -> Any:
            context = _read_project_context(input.headers, payload_converter)
            if context is None:
                return await self.next.execute_workflow(input)

            token = project_context.set(context)
            try:
                return await self.next.execute_workflow(input)
            finally:
                project_context.reset(token)

    return _ProjectWorkflowInboundInterceptor


class _ProjectActivityInboundInterceptor(ActivityInboundInterceptor):
    def __init__(
        self,
        next: ActivityInboundInterceptor,
        payload_converter: PayloadConverter,
    ) -> None:
        super().__init__(next)
        self._payload_converter = payload_converter

    async def execute_activity(self, input: ExecuteActivityInput) -> Any:
        context = _read_project_context(input.headers, self._payload_converter)
        if context is None:
            return await self.next.execute_activity(input)

        token = project_context.set(context)
        try:
            return await self.next.execute_activity(input)
        finally:
            project_context.reset(token)


class ProjectContextInterceptor(ClientInterceptor, WorkerInterceptor):
    def __init__(self, payload_converter: PayloadConverter) -> None:
        self._payload_converter = payload_converter

    def intercept_client(self, next: OutboundInterceptor) -> OutboundInterceptor:
        return _ProjectClientOutboundInterceptor(next, self._payload_converter)

    def intercept_activity(self, next: ActivityInboundInterceptor) -> ActivityInboundInterceptor:
        return _ProjectActivityInboundInterceptor(next, self._payload_converter)

    def workflow_interceptor_class(
        self,
        input: WorkflowInterceptorClassInput,
    ) -> type[WorkflowInboundInterceptor]:
        return _workflow_inbound_interceptor_class(self._payload_converter)
