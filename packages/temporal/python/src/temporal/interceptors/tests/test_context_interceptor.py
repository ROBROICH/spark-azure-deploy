"""Tests for ContextInterceptor."""

from __future__ import annotations

import asyncio
import dataclasses
from datetime import timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from audit_client.forwarding import actor_user_id_ctx, audit_headers_ctx, bearer_token_ctx, current_audit_headers
from temporalio import activity, workflow
from temporalio.api.common.v1 import Payload
from temporalio.api.enums.v1 import IndexedValueType
from temporalio.api.operatorservice.v1 import AddSearchAttributesRequest
from temporalio.common import SearchAttributePair, TypedSearchAttributes
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import UnsandboxedWorkflowRunner, Worker

from temporal.interceptors.context_interceptor import (
    ACTOR_USER_ID_HEADER,
    BEARER_TOKEN_HEADER,
    ROOT_RUN_ID_HEADER,
    ContextInterceptor,
    _ContextActivityInboundInterceptor,
    _ContextWorkflowOutboundInterceptor,
    _workflow_inbound_interceptor_class,
    decode_actor_user_id,
    decode_bearer_token,
    decode_root_run_id,
    encode_actor_user_id,
    encode_bearer_token,
    encode_root_run_id,
)
from temporal.project_context import (
    PROJECT_ID_SEARCH_ATTRIBUTE,
    PROJECT_VERSION_SEARCH_ATTRIBUTE,
    ProjectContext,
    current_project_context,
)

SEARCH_ATTR_ONLY_PROJECT_CONTEXT = ProjectContext(
    project_id="88886669-c659-4e50-ad92-01a2794a9938",
    project_version=1,
)


def _headers_with_token(token: str) -> dict[str, Payload]:
    return {BEARER_TOKEN_HEADER: encode_bearer_token(token)}


def _headers_with_actor(user_id: UUID) -> dict[str, Payload]:
    return {ACTOR_USER_ID_HEADER: encode_actor_user_id(user_id)}


def _headers_with_both(token: str, user_id: UUID) -> dict[str, Payload]:
    return {
        BEARER_TOKEN_HEADER: encode_bearer_token(token),
        ACTOR_USER_ID_HEADER: encode_actor_user_id(user_id),
    }


@dataclasses.dataclass
class _ActivityInput:
    headers: dict[str, Payload]


@dataclasses.dataclass
class _ActivityStartInput:
    headers: dict[str, Payload]


# ---------------------------------------------------------------------------
# encode / decode helpers
# ---------------------------------------------------------------------------


class TestEncodeDecodeHelpers:
    def test_bearer_token_roundtrip(self) -> None:
        token = "eyJhbGciOiJSUzI1NiJ9.test-payload"
        assert decode_bearer_token(_headers_with_token(token)) == token

    def test_bearer_token_missing_header_returns_none(self) -> None:
        assert decode_bearer_token({}) is None

    def test_bearer_token_empty_payload_returns_none(self) -> None:
        assert decode_bearer_token({BEARER_TOKEN_HEADER: Payload(data=b"")}) is None

    def test_actor_user_id_roundtrip(self) -> None:
        user_id = uuid4()
        assert decode_actor_user_id(_headers_with_actor(user_id)) == user_id

    def test_actor_user_id_missing_header_returns_none(self) -> None:
        assert decode_actor_user_id({}) is None

    def test_actor_user_id_empty_payload_returns_none(self) -> None:
        assert decode_actor_user_id({ACTOR_USER_ID_HEADER: Payload(data=b"")}) is None

    def test_actor_user_id_invalid_uuid_returns_none(self) -> None:
        assert decode_actor_user_id({ACTOR_USER_ID_HEADER: Payload(data=b"not-a-uuid")}) is None

    def test_root_run_id_roundtrip(self) -> None:
        run_id = "019e2cc3-aa39-7c45-a6e7-aeb796d631e7"
        assert decode_root_run_id({ROOT_RUN_ID_HEADER: encode_root_run_id(run_id)}) == run_id

    def test_root_run_id_missing_header_returns_none(self) -> None:
        assert decode_root_run_id({}) is None

    def test_root_run_id_empty_payload_returns_none(self) -> None:
        assert decode_root_run_id({ROOT_RUN_ID_HEADER: Payload(data=b"")}) is None


# ---------------------------------------------------------------------------
# _ContextActivityInboundInterceptor
# ---------------------------------------------------------------------------


_MOCK_WF_RUN_ID = "test-wf-run-id-001"
_MOCK_WF_TYPE = "test_workflow"


def _make_activity_info(workflow_run_id: str = _MOCK_WF_RUN_ID, workflow_type: str = _MOCK_WF_TYPE) -> MagicMock:
    info = MagicMock()
    info.workflow_run_id = workflow_run_id
    info.workflow_type = workflow_type
    return info


class TestActivityInbound:
    @pytest.fixture(autouse=True)
    def mock_activity_info(self):
        with patch(
            "temporal.interceptors.context_interceptor._activity.info",
            return_value=_make_activity_info(),
        ):
            yield

    def _inbound(self, side_effect: Any = None) -> tuple[_ContextActivityInboundInterceptor, AsyncMock]:
        next_mock = MagicMock()
        next_mock.execute_activity = AsyncMock(side_effect=side_effect, return_value="result")
        return _ContextActivityInboundInterceptor(next_mock, MagicMock()), next_mock.execute_activity

    @pytest.mark.asyncio
    async def test_bearer_token_set_during_activity(self) -> None:
        observed: list[str | None] = []

        inbound, _ = self._inbound(side_effect=lambda _: observed.append(bearer_token_ctx.get()))
        await inbound.execute_activity(_ActivityInput(headers=_headers_with_token("tok-123")))  # type: ignore[arg-type]

        assert observed == ["tok-123"]

    @pytest.mark.asyncio
    async def test_actor_user_id_set_during_activity(self) -> None:
        observed: list[UUID | None] = []
        user_id = uuid4()

        inbound, _ = self._inbound(side_effect=lambda _: observed.append(actor_user_id_ctx.get()))
        await inbound.execute_activity(_ActivityInput(headers=_headers_with_actor(user_id)))  # type: ignore[arg-type]

        assert observed == [user_id]

    @pytest.mark.asyncio
    async def test_both_context_vars_set_during_activity(self) -> None:
        observed_token: list[str | None] = []
        observed_actor: list[UUID | None] = []
        user_id = uuid4()

        def capture(_: Any) -> None:
            observed_token.append(bearer_token_ctx.get())
            observed_actor.append(actor_user_id_ctx.get())

        inbound, _ = self._inbound(side_effect=capture)
        await inbound.execute_activity(_ActivityInput(headers=_headers_with_both("tok-456", user_id)))  # type: ignore[arg-type]

        assert observed_token == ["tok-456"]
        assert observed_actor == [user_id]

    @pytest.mark.asyncio
    async def test_context_vars_cleared_after_activity(self) -> None:
        user_id = uuid4()
        inbound, _ = self._inbound()
        await inbound.execute_activity(_ActivityInput(headers=_headers_with_both("tok-123", user_id)))  # type: ignore[arg-type]

        assert bearer_token_ctx.get() is None
        assert actor_user_id_ctx.get() is None

    @pytest.mark.asyncio
    async def test_context_vars_cleared_on_exception(self) -> None:
        user_id = uuid4()
        inbound, _ = self._inbound(side_effect=RuntimeError("boom"))

        with pytest.raises(RuntimeError):
            await inbound.execute_activity(_ActivityInput(headers=_headers_with_both("tok-123", user_id)))  # type: ignore[arg-type]

        assert bearer_token_ctx.get() is None
        assert actor_user_id_ctx.get() is None

    @pytest.mark.asyncio
    async def test_no_headers_sets_none(self) -> None:
        observed_token: list[str | None] = []
        observed_actor: list[UUID | None] = []

        def capture(_: Any) -> None:
            observed_token.append(bearer_token_ctx.get())
            observed_actor.append(actor_user_id_ctx.get())

        inbound, _ = self._inbound(side_effect=capture)
        await inbound.execute_activity(_ActivityInput(headers={}))  # type: ignore[arg-type]

        assert observed_token == [None]
        assert observed_actor == [None]

    @pytest.mark.asyncio
    async def test_audit_headers_set_during_activity(self) -> None:
        observed: list[dict] = []

        inbound, _ = self._inbound(side_effect=lambda _: observed.append(current_audit_headers()))
        await inbound.execute_activity(_ActivityInput(headers={}))  # type: ignore[arg-type]

        assert len(observed) == 1
        assert observed[0]["X-Workflow-Run-Id"] == _MOCK_WF_RUN_ID
        assert observed[0]["X-Workflow-Type"] == _MOCK_WF_TYPE

    @pytest.mark.asyncio
    async def test_audit_run_id_prefers_root_header_over_activity_info(self) -> None:
        observed: list[dict] = []
        root_run_id = "root-run-from-header"

        inbound, _ = self._inbound(side_effect=lambda _: observed.append(current_audit_headers()))
        await inbound.execute_activity(
            _ActivityInput(headers={ROOT_RUN_ID_HEADER: encode_root_run_id(root_run_id)})  # type: ignore[arg-type]
        )

        assert observed[0]["X-Workflow-Run-Id"] == root_run_id

    @pytest.mark.asyncio
    async def test_audit_run_id_falls_back_to_activity_info_without_header(self) -> None:
        observed: list[dict] = []

        inbound, _ = self._inbound(side_effect=lambda _: observed.append(current_audit_headers()))
        await inbound.execute_activity(_ActivityInput(headers={}))  # type: ignore[arg-type]

        assert observed[0]["X-Workflow-Run-Id"] == _MOCK_WF_RUN_ID

    @pytest.mark.asyncio
    async def test_audit_headers_include_triggered_by_when_actor_present(self) -> None:
        observed: list[dict] = []
        user_id = uuid4()

        inbound, _ = self._inbound(side_effect=lambda _: observed.append(current_audit_headers()))
        await inbound.execute_activity(_ActivityInput(headers=_headers_with_actor(user_id)))  # type: ignore[arg-type]

        assert observed[0]["X-Triggered-By-User-Id"] == str(user_id)

    @pytest.mark.asyncio
    async def test_audit_headers_cleared_after_activity(self) -> None:
        inbound, _ = self._inbound()
        await inbound.execute_activity(_ActivityInput(headers={}))  # type: ignore[arg-type]

        assert audit_headers_ctx.get() is None


# ---------------------------------------------------------------------------
# _ContextWorkflowInboundInterceptor + _ContextWorkflowOutboundInterceptor
# ---------------------------------------------------------------------------


class TestWorkflowInterceptors:
    def _build_chain(self) -> tuple[Any, MagicMock]:
        outbound_next = MagicMock()
        outbound_next.start_activity = MagicMock(return_value=MagicMock())
        outbound_next.start_local_activity = MagicMock(return_value=MagicMock())
        outbound_next.start_child_workflow = MagicMock(return_value=MagicMock())

        inbound_cls = _workflow_inbound_interceptor_class(MagicMock())
        inbound = inbound_cls(MagicMock())
        inbound.init(outbound_next)
        return inbound, outbound_next

    @pytest.mark.asyncio
    async def test_token_stored_after_execute_workflow(self) -> None:
        inbound, _ = self._build_chain()
        inbound.next = MagicMock()
        inbound.next.execute_workflow = AsyncMock(return_value=None)

        wf_input = MagicMock()
        wf_input.headers = _headers_with_token("wf-token")
        info = MagicMock()
        info.typed_search_attributes = TypedSearchAttributes([])

        with patch("temporal.interceptors.context_interceptor._workflow.info", return_value=info):
            await inbound.execute_workflow(wf_input)

        assert inbound._token_holder[0] == "wf-token"

    @pytest.mark.asyncio
    async def test_actor_user_id_stored_after_execute_workflow(self) -> None:
        user_id = uuid4()
        inbound, _ = self._build_chain()
        inbound.next = MagicMock()
        inbound.next.execute_workflow = AsyncMock(return_value=None)

        wf_input = MagicMock()
        wf_input.headers = _headers_with_actor(user_id)
        info = MagicMock()
        info.typed_search_attributes = TypedSearchAttributes([])

        with patch("temporal.interceptors.context_interceptor._workflow.info", return_value=info):
            await inbound.execute_workflow(wf_input)

        assert inbound._actor_user_id_holder[0] == user_id

    @pytest.mark.asyncio
    async def test_no_headers_in_workflow(self) -> None:
        inbound, _ = self._build_chain()
        inbound.next = MagicMock()
        inbound.next.execute_workflow = AsyncMock(return_value=None)

        wf_input = MagicMock()
        wf_input.headers = {}
        info = MagicMock()
        info.typed_search_attributes = TypedSearchAttributes([])

        with patch("temporal.interceptors.context_interceptor._workflow.info", return_value=info):
            await inbound.execute_workflow(wf_input)

        assert inbound._token_holder[0] is None
        assert inbound._actor_user_id_holder[0] is None

    @pytest.mark.asyncio
    async def test_project_context_falls_back_to_workflow_search_attributes(self) -> None:
        observed: list[ProjectContext | None] = []
        inbound, _ = self._build_chain()

        def capture(_: Any) -> None:
            observed.append(current_project_context())

        inbound.next = MagicMock()
        inbound.next.execute_workflow = AsyncMock(side_effect=capture, return_value=None)

        info = MagicMock()
        info.typed_search_attributes = TypedSearchAttributes(
            [
                SearchAttributePair(PROJECT_ID_SEARCH_ATTRIBUTE, "project-123"),
                SearchAttributePair(PROJECT_VERSION_SEARCH_ATTRIBUTE, 7),
            ]
        )
        wf_input = MagicMock()
        wf_input.headers = {}

        with patch("temporal.interceptors.context_interceptor._workflow.info", return_value=info):
            await inbound.execute_workflow(wf_input)

        assert observed == [ProjectContext(project_id="project-123", project_version=7)]
        assert current_project_context() is None

    def test_outbound_injects_both_into_start_activity(self) -> None:
        captured: list[_ActivityStartInput] = []
        next_mock = MagicMock()
        next_mock.start_activity = MagicMock(side_effect=captured.append)

        user_id = uuid4()
        outbound = _ContextWorkflowOutboundInterceptor(next_mock, MagicMock(), ["act-token"], [user_id])
        outbound.start_activity(_ActivityStartInput(headers={}))

        assert len(captured) == 1
        assert decode_bearer_token(captured[0].headers) == "act-token"
        assert decode_actor_user_id(captured[0].headers) == user_id

    def test_outbound_injects_both_into_start_local_activity(self) -> None:
        captured: list[_ActivityStartInput] = []
        next_mock = MagicMock()
        next_mock.start_local_activity = MagicMock(side_effect=captured.append)

        user_id = uuid4()
        outbound = _ContextWorkflowOutboundInterceptor(next_mock, MagicMock(), ["local-token"], [user_id])
        outbound.start_local_activity(_ActivityStartInput(headers={}))

        assert decode_bearer_token(captured[0].headers) == "local-token"
        assert decode_actor_user_id(captured[0].headers) == user_id

    def test_outbound_injects_both_into_start_child_workflow(self) -> None:
        captured: list[_ActivityStartInput] = []
        next_mock = MagicMock()
        next_mock.start_child_workflow = MagicMock(side_effect=captured.append)

        user_id = uuid4()
        outbound = _ContextWorkflowOutboundInterceptor(next_mock, MagicMock(), ["child-token"], [user_id])
        outbound.start_child_workflow(_ActivityStartInput(headers={}))

        assert decode_bearer_token(captured[0].headers) == "child-token"
        assert decode_actor_user_id(captured[0].headers) == user_id

    def test_outbound_skips_injection_when_no_values(self) -> None:
        captured: list[_ActivityStartInput] = []
        next_mock = MagicMock()
        next_mock.start_activity = MagicMock(side_effect=captured.append)

        outbound = _ContextWorkflowOutboundInterceptor(next_mock, MagicMock(), [None], [None])
        outbound.start_activity(_ActivityStartInput(headers={}))

        assert decode_bearer_token(captured[0].headers) is None
        assert decode_actor_user_id(captured[0].headers) is None

    def test_outbound_preserves_existing_headers(self) -> None:
        captured: list[_ActivityStartInput] = []
        next_mock = MagicMock()
        next_mock.start_activity = MagicMock(side_effect=captured.append)

        existing = Payload(data=b"existing")
        user_id = uuid4()
        outbound = _ContextWorkflowOutboundInterceptor(next_mock, MagicMock(), ["injected-token"], [user_id])
        outbound.start_activity(_ActivityStartInput(headers={"x-other": existing}))

        headers = captured[0].headers
        assert headers["x-other"] is existing
        assert decode_bearer_token(headers) == "injected-token"
        assert decode_actor_user_id(headers) == user_id

    def test_outbound_injects_root_run_id_from_workflow_info(self) -> None:
        captured: list[_ActivityStartInput] = []
        next_mock = MagicMock()
        next_mock.start_activity = MagicMock(side_effect=captured.append)

        info = MagicMock()
        info.root = MagicMock(run_id="root-run-id-from-info")
        info.run_id = "this-workflows-run-id"

        outbound = _ContextWorkflowOutboundInterceptor(next_mock, MagicMock(), [None], [None])
        with patch("temporal.interceptors.context_interceptor._workflow.info", return_value=info):
            outbound.start_activity(_ActivityStartInput(headers={}))

        assert decode_root_run_id(captured[0].headers) == "root-run-id-from-info"

    def test_outbound_uses_own_run_id_when_workflow_is_root(self) -> None:
        captured: list[_ActivityStartInput] = []
        next_mock = MagicMock()
        next_mock.start_activity = MagicMock(side_effect=captured.append)

        info = MagicMock()
        info.root = None
        info.run_id = "im-the-root"

        outbound = _ContextWorkflowOutboundInterceptor(next_mock, MagicMock(), [None], [None])
        with patch("temporal.interceptors.context_interceptor._workflow.info", return_value=info):
            outbound.start_activity(_ActivityStartInput(headers={}))

        assert decode_root_run_id(captured[0].headers) == "im-the-root"

    def test_outbound_skips_root_run_id_outside_workflow_context(self) -> None:
        captured: list[_ActivityStartInput] = []
        next_mock = MagicMock()
        next_mock.start_activity = MagicMock(side_effect=captured.append)

        outbound = _ContextWorkflowOutboundInterceptor(next_mock, MagicMock(), [None], [None])
        # No patch — workflow.info() raises outside a workflow runtime.
        outbound.start_activity(_ActivityStartInput(headers={}))

        assert decode_root_run_id(captured[0].headers) is None

    def test_outbound_injects_root_run_id_into_child_workflow(self) -> None:
        captured: list[_ActivityStartInput] = []
        next_mock = MagicMock()
        next_mock.start_child_workflow = MagicMock(side_effect=captured.append)

        info = MagicMock()
        info.root = MagicMock(run_id="root-for-child")
        info.run_id = "current-run"

        outbound = _ContextWorkflowOutboundInterceptor(next_mock, MagicMock(), [None], [None])
        with patch("temporal.interceptors.context_interceptor._workflow.info", return_value=info):
            outbound.start_child_workflow(_ActivityStartInput(headers={}))

        assert decode_root_run_id(captured[0].headers) == "root-for-child"


@activity.defn(name="assert_project_context_from_search_attrs")
async def assert_project_context_from_search_attrs() -> None:
    if current_project_context() != SEARCH_ATTR_ONLY_PROJECT_CONTEXT:
        raise ValueError(f"Unexpected activity project context: {current_project_context()}")


@workflow.defn(name="SearchAttributeOnlyProjectContextWorkflow")
class SearchAttributeOnlyProjectContextWorkflow:
    @workflow.run
    async def run(self) -> None:
        if current_project_context() != SEARCH_ATTR_ONLY_PROJECT_CONTEXT:
            raise ValueError(f"Unexpected workflow project context: {current_project_context()}")

        await workflow.execute_activity(
            assert_project_context_from_search_attrs,
            start_to_close_timeout=timedelta(seconds=5),
        )


@pytest.mark.asyncio
async def test_project_context_falls_back_to_search_attributes_in_temporal_runtime() -> None:
    """A workflow with project search attributes but no context header still gets context."""
    task_queue = f"search-attr-context-{uuid4()}"
    workflow_id = f"search-attr-context-{uuid4()}"
    search_attributes = TypedSearchAttributes(
        [
            SearchAttributePair(
                PROJECT_ID_SEARCH_ATTRIBUTE,
                SEARCH_ATTR_ONLY_PROJECT_CONTEXT.project_id,
            ),
            SearchAttributePair(
                PROJECT_VERSION_SEARCH_ATTRIBUTE,
                SEARCH_ATTR_ONLY_PROJECT_CONTEXT.project_version,
            ),
        ]
    )

    async with await WorkflowEnvironment.start_local() as env:
        await env.client.operator_service.add_search_attributes(
            AddSearchAttributesRequest(
                namespace=env.client.namespace,
                search_attributes={
                    PROJECT_ID_SEARCH_ATTRIBUTE.name: IndexedValueType.Value("INDEXED_VALUE_TYPE_KEYWORD"),
                    PROJECT_VERSION_SEARCH_ATTRIBUTE.name: IndexedValueType.Value("INDEXED_VALUE_TYPE_INT"),
                },
            )
        )
        async with Worker(
            env.client,
            task_queue=task_queue,
            workflows=[SearchAttributeOnlyProjectContextWorkflow],
            activities=[assert_project_context_from_search_attrs],
            interceptors=[ContextInterceptor(env.client.data_converter.payload_converter)],
            workflow_runner=UnsandboxedWorkflowRunner(),
        ):
            handle = await env.client.start_workflow(
                SearchAttributeOnlyProjectContextWorkflow.run,
                id=workflow_id,
                task_queue=task_queue,
                search_attributes=search_attributes,
            )

            await asyncio.wait_for(handle.result(), timeout=10)

        description = await handle.describe()
        indexed_fields = {
            pair.key.name: pair.value
            for pair in description.typed_search_attributes
            if pair.key.name in {PROJECT_ID_SEARCH_ATTRIBUTE.name, PROJECT_VERSION_SEARCH_ATTRIBUTE.name}
        }
        assert indexed_fields == {
            PROJECT_ID_SEARCH_ATTRIBUTE.name: SEARCH_ATTR_ONLY_PROJECT_CONTEXT.project_id,
            PROJECT_VERSION_SEARCH_ATTRIBUTE.name: SEARCH_ATTR_ONLY_PROJECT_CONTEXT.project_version,
        }
