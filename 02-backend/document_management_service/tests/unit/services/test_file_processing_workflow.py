from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from temporal.workflows.project_versioning.types import CreateProjectVersionInput

from src.models.db.file_enum import FileTypeEnum
from src.services.workflows.activities.activity_models import (
    FileChange,
    FileDiffResult,
    NewFile,
    RenameChange,
    SingleFileResult,
    Unchanged,
)
from src.services.workflows.file_processing import FileProcessingWorkflow
from src.services.workflows.workflow_models import FileProcessingInput, FileProcessingSuccess


def _workflow_input(file_type: str = FileTypeEnum.ZIP.value) -> FileProcessingInput:
    return FileProcessingInput(
        file_id=str(uuid4()),
        filename="archive.zip",
        project_id=str(uuid4()),
        file_type=file_type,
        entry_file_type=(
            FileTypeEnum.EWMS_DOCUMENT.value
            if file_type == FileTypeEnum.EWMS_ZIP.value
            else FileTypeEnum.DOCUMENT.value
        ),
    )


def test_regular_zip_first_upload_does_not_require_approval():
    workflow = FileProcessingWorkflow()
    workflow._diff_result = FileDiffResult(
        new=[
            NewFile(
                filename="doc.pdf",
                bucket_path="tmp/project/doc.pdf",
                sha="new-sha",
            )
        ]
    )

    with patch("src.services.workflows.file_processing.settings") as mock_settings:
        mock_settings.TEMPORAL.ENABLE_APPROVAL = True

        assert workflow._requires_approval(workflow_input=_workflow_input()) is False


def test_regular_zip_first_upload_commits_through_project_version_workflow():
    workflow = FileProcessingWorkflow()
    workflow._diff_result = FileDiffResult(
        new=[
            NewFile(
                filename="doc.pdf",
                bucket_path="tmp/project/doc.pdf",
                sha="new-sha",
            )
        ]
    )

    assert workflow._should_create_project_version(workflow_input=_workflow_input()) is True


def test_regular_zip_with_existing_files_requires_approval():
    workflow = FileProcessingWorkflow()
    workflow._diff_result = FileDiffResult(
        unchanged=[
            Unchanged(
                file_id=str(uuid4()),
                filename="doc.pdf",
                sha="existing-sha",
            )
        ]
    )

    with patch("src.services.workflows.file_processing.settings") as mock_settings:
        mock_settings.TEMPORAL.ENABLE_APPROVAL = True

        assert workflow._requires_approval(workflow_input=_workflow_input()) is True


def test_regular_zip_with_existing_files_creates_project_version():
    workflow = FileProcessingWorkflow()
    workflow._diff_result = FileDiffResult(
        unchanged=[
            Unchanged(
                file_id=str(uuid4()),
                filename="doc.pdf",
                sha="existing-sha",
            )
        ]
    )

    assert workflow._should_create_project_version(workflow_input=_workflow_input()) is True


def test_ewms_zip_never_requires_approval():
    workflow = FileProcessingWorkflow()
    workflow._diff_result = FileDiffResult(
        unchanged=[
            Unchanged(
                file_id=str(uuid4()),
                filename="E1234.pdf",
                sha="existing-sha",
            )
        ]
    )

    with patch("src.services.workflows.file_processing.settings") as mock_settings:
        mock_settings.TEMPORAL.ENABLE_APPROVAL = True

        assert workflow._requires_approval(workflow_input=_workflow_input(FileTypeEnum.EWMS_ZIP.value)) is False


def test_ewms_zip_never_creates_project_version():
    workflow = FileProcessingWorkflow()
    workflow._diff_result = FileDiffResult(
        unchanged=[
            Unchanged(
                file_id=str(uuid4()),
                filename="E1234.pdf",
                sha="existing-sha",
            )
        ]
    )

    assert workflow._should_create_project_version(workflow_input=_workflow_input(FileTypeEnum.EWMS_ZIP.value)) is False


def test_successful_results_from_committed_diff():
    changed_id = str(uuid4())
    renamed_id = str(uuid4())
    workflow = FileProcessingWorkflow()
    workflow._diff_result = FileDiffResult(
        new=[
            NewFile(
                filename="new.pdf",
                bucket_path="tmp/new.pdf",
                sha="new-sha",
            )
        ],
        changed=[
            FileChange(
                file_id=changed_id,
                filename="changed.pdf",
                bucket_path="tmp/changed.pdf",
                source_sha="old-sha",
                target_sha="new-sha",
            )
        ],
        renamed=[
            RenameChange(
                file_id=renamed_id,
                old_name="old.pdf",
                new_name="renamed.pdf",
                sha="same-sha",
            )
        ],
    )

    result = workflow._successful_results_from_committed_diff()

    assert [(item.file_id, item.filename, item.action) for item in result] == [
        (None, "new.pdf", "INGEST"),
        (changed_id, "changed.pdf", "INGEST"),
        (renamed_id, "renamed.pdf", "RENAME"),
    ]


def test_ewms_file_ids_for_workflow_start_uses_ingested_ewms_documents():
    workflow = FileProcessingWorkflow()
    ingested_id = str(uuid4())
    renamed_id = str(uuid4())

    result = workflow._ewms_file_ids_for_workflow_start(
        _workflow_input(FileTypeEnum.EWMS_ZIP.value),
        [
            FileProcessingSuccess(file_id=ingested_id, filename="E1234.pdf", action="INGEST"),
            FileProcessingSuccess(file_id=renamed_id, filename="E5678.pdf", action="RENAME"),
            FileProcessingSuccess(file_id=None, filename="new.pdf", action="INGEST"),
        ],
    )

    assert result == [UUID(ingested_id)]


def test_ewms_file_ids_for_workflow_start_skips_regular_zip():
    workflow = FileProcessingWorkflow()

    result = workflow._ewms_file_ids_for_workflow_start(
        _workflow_input(FileTypeEnum.ZIP.value),
        [FileProcessingSuccess(file_id=str(uuid4()), filename="doc.pdf", action="INGEST")],
    )

    assert result == []


@pytest.mark.asyncio
async def test_start_ewms_workflow_if_needed_starts_workflow(monkeypatch):
    workflow = FileProcessingWorkflow()
    file_id = str(uuid4())
    second_file_id = str(uuid4())
    start_ewms_orchestrator_workflow = AsyncMock()
    monkeypatch.setattr(
        "src.services.workflows.file_processing.start_ewms_orchestrator_workflow",
        start_ewms_orchestrator_workflow,
    )

    await workflow._start_ewms_workflow_if_needed(
        _workflow_input(FileTypeEnum.EWMS_ZIP.value),
        [
            FileProcessingSuccess(file_id=file_id, filename="E1234.pdf", action="INGEST"),
            FileProcessingSuccess(file_id=second_file_id, filename="E5678.pdf", action="INGEST"),
        ],
        project_version=1,
    )

    start_ewms_orchestrator_workflow.assert_awaited_once()
    workflow_input = start_ewms_orchestrator_workflow.await_args.args[0]
    assert workflow_input.project_id == UUID(str(start_ewms_orchestrator_workflow.await_args.kwargs["project_id"]))
    assert workflow_input.file_ids == [UUID(file_id), UUID(second_file_id)]
    assert start_ewms_orchestrator_workflow.await_args.kwargs["project_version"] == 1


@pytest.mark.asyncio
async def test_start_ewms_workflow_if_needed_skips_when_no_file_ids(monkeypatch):
    workflow = FileProcessingWorkflow()
    start_ewms_orchestrator_workflow = AsyncMock()
    monkeypatch.setattr(
        "src.services.workflows.file_processing.start_ewms_orchestrator_workflow",
        start_ewms_orchestrator_workflow,
    )

    await workflow._start_ewms_workflow_if_needed(
        _workflow_input(FileTypeEnum.EWMS_ZIP.value),
        [FileProcessingSuccess(file_id=None, filename="E1234.pdf", action="INGEST")],
        project_version=1,
    )

    start_ewms_orchestrator_workflow.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_project_version_includes_zip_file_id(monkeypatch):
    workflow = FileProcessingWorkflow()
    workflow._diff_result = FileDiffResult(
        changed=[
            FileChange(
                file_id=str(uuid4()),
                filename="changed.pdf",
                bucket_path="tmp/changed.pdf",
                source_sha="old-sha",
                target_sha="new-sha",
            )
        ]
    )
    workflow_input = _workflow_input()
    execute_mock = AsyncMock(return_value={"status": "success", "new_version": 2})
    monkeypatch.setattr(
        "src.services.workflows.file_processing.execute_workflow",
        execute_mock,
    )

    result = await workflow._create_project_version(workflow_input=workflow_input)

    assert result == 2
    payload = execute_mock.await_args.kwargs["input"]
    assert isinstance(payload, CreateProjectVersionInput)
    assert str(payload.zip_file_id) == workflow_input.file_id
    assert payload.file_diff.changed[0].file_id == workflow._diff_result.changed[0].file_id
    assert payload.file_diff.changed[0].filename == "changed.pdf"


@pytest.mark.asyncio
async def test_first_regular_zip_upload_uses_project_version_workflow(monkeypatch):
    calls: list[str] = []

    async def fake_execute_activity(activity, *args, **_kwargs):
        activity_name = getattr(activity, "__name__", str(activity))
        calls.append(activity_name)

        if activity_name == "update_file_status":
            return None
        if activity_name == "validate_zip":
            return None
        if activity_name == "extract_zip":
            return [
                SingleFileResult(
                    success=True,
                    filename="doc.pdf",
                    action="UNZIP",
                    bucket_path="tmp/project/doc.pdf",
                )
            ]
        if activity_name == "create_diff":
            return FileDiffResult(
                new=[
                    NewFile(
                        filename="doc.pdf",
                        bucket_path="tmp/project/doc.pdf",
                        sha="new-sha",
                    )
                ]
            )
        if activity_name == "persist_zip_diff":
            return None
        if activity_name == "ingest_file":
            raise AssertionError("new-only ZIP uploads must not bypass PLS version finalization")

        raise AssertionError(f"Unexpected activity: {activity_name} with args {args}")

    execute_create_project_version_mock = AsyncMock(return_value={"status": "success", "new_version": 1})
    monkeypatch.setattr(
        "src.services.workflows.file_processing.workflow.execute_activity",
        fake_execute_activity,
    )
    monkeypatch.setattr(
        "src.services.workflows.file_processing.execute_workflow",
        execute_create_project_version_mock,
    )
    monkeypatch.setattr(
        "src.services.workflows.file_processing.workflow.logger",
        SimpleNamespace(info=lambda *_, **__: None, exception=lambda *_, **__: None),
    )

    workflow_input = _workflow_input()
    workflow_input.zip_path = "tmp/archive.zip"

    result = await FileProcessingWorkflow().run(workflow_input)

    assert result.status == "APPROVED"
    assert calls == [
        "update_file_status",
        "validate_zip",
        "extract_zip",
        "create_diff",
        "persist_zip_diff",
        "update_file_status",
    ]
    execute_create_project_version_mock.assert_awaited_once()
