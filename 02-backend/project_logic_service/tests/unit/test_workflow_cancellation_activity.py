from types import SimpleNamespace
from uuid import UUID

import pytest

from src.services.workflows.activities import workflow_cancellation


async def _workflow_iterator(workflows):
    for workflow in workflows:
        yield workflow


@pytest.mark.asyncio
async def test_cancel_project_version_workflows_skips_excluded_ids(monkeypatch):
    project_id = UUID("00000000-0000-0000-0000-00000000f001")
    cancelled: list[tuple[str, str]] = []
    queries: list[str] = []

    class FakeHandle:
        def __init__(self, workflow_id: str, run_id: str) -> None:
            self.workflow_id = workflow_id
            self.run_id = run_id

        async def cancel(self) -> None:
            cancelled.append((self.workflow_id, self.run_id))

    class FakeClient:
        def list_workflows(self, query: str):
            queries.append(query)
            return _workflow_iterator(
                [
                    SimpleNamespace(id="current-copy-workflow", run_id="copy-run"),
                    SimpleNamespace(id="file-processing-root", run_id="root-run"),
                    SimpleNamespace(id="old-fvp-workflow", run_id="fvp-run"),
                ]
            )

        def get_workflow_handle(self, workflow_id: str, run_id: str) -> FakeHandle:
            return FakeHandle(workflow_id, run_id)

    async def fake_get_temporal_client() -> FakeClient:
        return FakeClient()

    monkeypatch.setattr(workflow_cancellation, "get_temporal_client", fake_get_temporal_client)

    result = await workflow_cancellation.cancel_project_version_workflows(
        project_id=project_id,
        project_version=3,
        excluded_workflow_ids=["current-copy-workflow", "file-processing-root"],
    )

    assert queries == [f'`ExecutionStatus` = "Running" AND `ProjectId` = "{project_id}" AND `ProjectVersion` = 3']
    assert cancelled == [("old-fvp-workflow", "fvp-run")]
    assert result == {
        "cancelled": [{"workflow_id": "old-fvp-workflow", "run_id": "fvp-run"}],
        "skipped": ["current-copy-workflow", "file-processing-root"],
    }
