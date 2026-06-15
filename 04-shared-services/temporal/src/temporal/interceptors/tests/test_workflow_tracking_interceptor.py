"""End-to-end: spin up a Temporal devserver, a worker with the tracking
interceptor wired in, and a stub HTTP transport impersonating the tracking
API. Run a simple workflow and assert the stub received status posts for
pending, running, and a terminal state."""

import asyncio
import json
from collections import defaultdict

import httpx
import pytest
from temporalio import workflow
from temporalio.client import Client
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import UnsandboxedWorkflowRunner, Worker

from temporal.activities.tracking import configure_tracking, post_status_activity
from temporal.interceptors import (
    WorkflowTrackingInterceptor,
    WorkflowTrackingWorkerInterceptor,
)
from temporal.tracking_client import TrackingClient

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


@workflow.defn(name="NoopWorkflow")
class NoopWorkflow:
    @workflow.run
    async def run(self) -> str:
        return "ok"


async def test_status_flow():
    received: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        try:
            received.append(json.loads(request.content.decode()))
        except Exception:
            received.append({})
        return httpx.Response(204)

    transport = httpx.MockTransport(handler)
    tracker = TrackingClient(base_url="http://stub")
    tracker._client = httpx.AsyncClient(timeout=3.0, transport=transport)
    configure_tracking(tracker)

    async with await WorkflowEnvironment.start_local() as env:
        client = env.client
        tracked_client = await Client.connect(
            target_host=env.client.service_client.config.target_host,
            namespace=env.client.namespace,
            interceptors=[WorkflowTrackingInterceptor(tracker)],
        )

        async with Worker(
            client,
            task_queue="tq",
            workflows=[NoopWorkflow],
            activities=[post_status_activity],
            interceptors=[WorkflowTrackingWorkerInterceptor()],
            workflow_runner=UnsandboxedWorkflowRunner(),
        ):
            handle = await tracked_client.start_workflow(
                NoopWorkflow.run, id="wf-test", task_queue="tq",
            )
            assert await handle.result() == "ok"

        await asyncio.sleep(0.2)

    statuses = [p.get("status") for p in received]
    assert "pending" in statuses
    assert "running" in statuses
    assert "completed" in statuses
    await tracker.aclose()
