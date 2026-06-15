from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from temporal.interceptors.project_context_interceptor import (
    _headers_with_project_context,
    _read_project_context,
)
from temporal.project_context import (
    PROJECT_ID_SEARCH_ATTRIBUTE,
    PROJECT_VERSION_SEARCH_ATTRIBUTE,
    ProjectContext,
    current_project_context,
    merge_project_search_attributes,
    project_scoped_workflow_id,
    use_project_context,
)
from temporal.utils import WorkflowName, start_workflow
from temporalio.converter import DataConverter


def test_project_scoped_workflow_id_adds_version_before_suffixes():
    assert project_scoped_workflow_id("Workflow", "project-1", 3, "norm-1") == "Workflow-project-1-v3-norm-1"


def test_project_scoped_workflow_id_uses_context_version():
    with use_project_context("project-1", 4):
        assert project_scoped_workflow_id("Workflow", "project-1", None, "norm-1") == "Workflow-project-1-v4-norm-1"


def test_merge_project_search_attributes_adds_project_id_and_version():
    search_attributes = merge_project_search_attributes(None, project_id="project-1", project_version=5)

    assert search_attributes is not None
    values = {pair.key.name: pair.value for pair in search_attributes}
    assert values == {
        PROJECT_ID_SEARCH_ATTRIBUTE.name: "project-1",
        PROJECT_VERSION_SEARCH_ATTRIBUTE.name: 5,
    }


def test_project_context_header_round_trips_through_payload_converter():
    payload_converter = DataConverter.default.payload_converter

    with use_project_context("project-1", 6):
        headers = _headers_with_project_context(None, payload_converter)

    assert _read_project_context(headers, payload_converter) == ProjectContext(
        project_id="project-1",
        project_version=6,
    )


@pytest.mark.asyncio
async def test_start_workflow_uses_explicit_project_context_during_client_start(monkeypatch):
    captured: dict[str, object] = {}

    class Client:
        async def start_workflow(self, *_, **kwargs):
            captured["context"] = current_project_context()
            captured["search_attributes"] = kwargs["search_attributes"]
            return SimpleNamespace(id=kwargs["id"])

    monkeypatch.setattr("temporal.utils.is_in_workflow", lambda: False)
    monkeypatch.setattr("temporal.utils.get_temporal_client", AsyncMock(return_value=Client()))

    with use_project_context("project-1", 2):
        handle = await start_workflow(
            WorkflowName("Workflow"),
            {"project_id": "project-1"},
            "queue",
            project_id="project-1",
            project_version=3,
        )
        assert current_project_context() == ProjectContext(project_id="project-1", project_version=2)

    assert handle.id == "Workflow-project-1-v3"
    assert captured["context"] == ProjectContext(project_id="project-1", project_version=3)
    values = {pair.key.name: pair.value for pair in captured["search_attributes"]}
    assert values[PROJECT_ID_SEARCH_ATTRIBUTE.name] == "project-1"
    assert values[PROJECT_VERSION_SEARCH_ATTRIBUTE.name] == 3
