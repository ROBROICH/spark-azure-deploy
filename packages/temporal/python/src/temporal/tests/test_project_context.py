from temporal.interceptors.project_context_interceptor import (
    _headers_with_project_context,
    _read_project_context,
)
from temporal.project_context import (
    PROJECT_ID_SEARCH_ATTRIBUTE,
    PROJECT_VERSION_SEARCH_ATTRIBUTE,
    ProjectContext,
    merge_project_search_attributes,
    project_scoped_workflow_id,
    use_project_context,
)
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
