from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from temporal.project_context import ProjectContext, current_project_context, use_project_context
from temporal.workflows.agent_orchestration.fvp import FVP_TASK_QUEUE, FVP_WORKFLOW_ID
from temporal.workflows.project_versioning.types import CreateProjectVersionInput

from src.models.db.workflow_enum import WorkflowStatusEnum
from src.services.workflows import create_project_version as workflow_module
from src.services.workflows.project_version_copy_plan import build_project_version_copy_plan_payload_from_rows

PROJECT_ID = UUID("00000000-0000-0000-0000-00000000f001")
ZIP_FILE_ID = UUID("00000000-0000-0000-0000-00000000f002")
DELETED_FILE_ID = UUID("00000000-0000-0000-0000-00000000f003")
FCS_DOCUMENT_ID = UUID("00000000-0000-0000-0000-00000000f004")
FCS_CATEGORY_ID = UUID("00000000-0000-0000-0000-00000000f009")
FCS_DOCUMENT_TYPE_ID = UUID("00000000-0000-0000-0000-00000000f010")
FCS_PROJECT_TEMPLATE_VERSION_ID = UUID("00000000-0000-0000-0000-00000000f011")
TOPIC_ID = UUID("00000000-0000-0000-0000-00000000f005")
PLAUSIBILITY_NOTE_ID = UUID("00000000-0000-0000-0000-00000000f006")
CHANGED_FILE_ID = UUID("00000000-0000-0000-0000-00000000f007")
FCS_CHANGED_DOCUMENT_ID = UUID("00000000-0000-0000-0000-00000000f008")

ENDPOINT_ROWS = [{"service": service, "base_url": f"http://{service}"} for service in workflow_module.SERVICE_ORDER]
URL_BY_SERVICE = {row["service"]: row["base_url"] for row in ENDPOINT_ROWS}

EXPECTED_NEW_VERSION = 2
EXPECTED_GENERATED_COPY_CALL_COUNT = 12


def _activity_name(activity) -> str:
    return activity if isinstance(activity, str) else activity.__name__


@pytest.mark.asyncio
async def test_approved_zip_path_fans_out_to_generated_copy_endpoints_then_dms_commit(monkeypatch):
    calls: list[tuple[str, tuple]] = []
    fvp_start_contexts: list[ProjectContext | None] = []

    rows_by_service = {
        "project_logic_service": [
            {
                "_service": "project_logic_service",
                "id": str(TOPIC_ID),
                "node_type": "topic",
                "parents": [],
                "frontend_parent_ids": [],
            }
        ],
        "document_management_service": [
            {
                "_service": "document_management_service",
                "id": str(DELETED_FILE_ID),
                "node_type": "file",
                "parents": [],
                "frontend_parent_ids": [],
            },
            {
                "_service": "document_management_service",
                "id": str(CHANGED_FILE_ID),
                "node_type": "file",
                "parents": [],
                "frontend_parent_ids": [],
            },
        ],
        "formal_completeness_check": [
            {
                "_service": "formal_completeness_check",
                "id": str(FCS_CATEGORY_ID),
                "node_type": "category",
                "parents": [],
                "frontend_parent_ids": [],
            },
            {
                "_service": "formal_completeness_check",
                "id": str(FCS_PROJECT_TEMPLATE_VERSION_ID),
                "node_type": "project_template_version",
                "parents": [],
                "frontend_parent_ids": [],
            },
            {
                "_service": "formal_completeness_check",
                "id": str(FCS_DOCUMENT_TYPE_ID),
                "node_type": "document_type",
                "parents": [
                    {
                        "id": str(FCS_CATEGORY_ID),
                        "node_type": "category",
                    }
                ],
                "frontend_parent_ids": [],
            },
            {
                "_service": "formal_completeness_check",
                "id": str(FCS_DOCUMENT_ID),
                "node_type": "document",
                "parents": [
                    {
                        "id": str(FCS_DOCUMENT_TYPE_ID),
                        "node_type": "document_type",
                    },
                    {
                        "id": str(DELETED_FILE_ID),
                        "node_type": "file",
                    },
                ],
                "frontend_parent_ids": [],
            },
            {
                "_service": "formal_completeness_check",
                "id": str(FCS_CHANGED_DOCUMENT_ID),
                "node_type": "document",
                "parents": [
                    {
                        "id": str(FCS_DOCUMENT_TYPE_ID),
                        "node_type": "document_type",
                    },
                    {
                        "id": str(CHANGED_FILE_ID),
                        "node_type": "file",
                    },
                ],
                "frontend_parent_ids": [],
            },
        ],
        "plausibility_notes": [
            {
                "_service": "plausibility_notes",
                "id": str(PLAUSIBILITY_NOTE_ID),
                "node_type": "plausibility_note",
                "parents": [],
                "frontend_parent_ids": [],
            }
        ],
    }

    async def fake_execute_activity(activity, *activity_args, args=(), **__):
        activity_name = _activity_name(activity)
        call_args = tuple(args) if args else tuple(activity_args)
        calls.append((activity_name, call_args))

        if activity_name == workflow_module.GET_PROJECT_VERSIONING_SERVICE_ENDPOINTS:
            return ENDPOINT_ROWS
        if activity_name == workflow_module.GET_LATEST_PLS_VERSION:
            return 1
        if activity_name == workflow_module.GET_PROJECT_INTERNAL_STATUS:
            return "OPEN"
        if activity_name == workflow_module.ACQUIRE_PROJECT_VERSION_LOCK:
            return "lock-token"
        if activity_name == workflow_module.CANCEL_PROJECT_VERSION_WORKFLOWS:
            return {"cancelled": [], "skipped": args[2]}
        if activity_name == workflow_module.UPDATE_DMS_ZIP_APPROVAL_STATUS:
            return {"ok": True}
        if activity_name == workflow_module.GET_DMS_ZIP_DIFF:
            return {
                "deleted": [{"file_id": str(DELETED_FILE_ID), "filename": "old.pdf"}],
                "changed": [{"file_id": str(CHANGED_FILE_ID), "filename": "changed.pdf"}],
                "renamed": [],
            }
        if activity_name == workflow_module.BUILD_PROJECT_VERSION_COPY_PLAN:
            service_endpoints, project_id, source_version, file_diff_payload = args
            assert service_endpoints == ENDPOINT_ROWS
            assert project_id == PROJECT_ID
            assert source_version == 1
            return build_project_version_copy_plan_payload_from_rows(
                rows_by_service=rows_by_service,
                file_diff=workflow_module.FileDiffSummary.model_validate(file_diff_payload),
                topic_norm_payload_rows=[],
            )
        if activity_name == workflow_module.COPY_SERVICE_VERSION_NODES:
            return {"copied": len(args[5])}
        if activity_name == workflow_module.COMMIT_DMS_ZIP_DIFF:
            return {"committed": not args[6]}
        if activity_name == workflow_module.COPY_PROJECT_ROOT_VERSION:
            return {"copied": 1}
        if activity_name == workflow_module.RELEASE_PROJECT_VERSION_LOCK:
            return None
        if activity_name == "start_decoupled_parent_workflow":
            fvp_start_contexts.append(current_project_context())
            return "FVPWorkflow-test"
        if activity_name == workflow_module.UPDATE_PROJECT_STATUS:
            return {"ok": True}

        raise AssertionError(f"Unexpected activity: {activity_name}")

    monkeypatch.setattr(workflow_module.workflow, "execute_activity", fake_execute_activity)
    monkeypatch.setattr(
        workflow_module.workflow,
        "info",
        lambda: SimpleNamespace(
            workflow_id="create-project-version-test",
            run_id="run-1",
            root=SimpleNamespace(workflow_id="file-processing-root"),
            parent=None,
        ),
    )
    monkeypatch.setattr(
        workflow_module.workflow,
        "logger",
        SimpleNamespace(info=lambda *_, **__: None, exception=lambda *_, **__: None),
    )
    monkeypatch.setattr(
        workflow_module,
        "execute_qdrant_source_file_cleanup",
        AsyncMock(return_value=None),
    )

    with use_project_context(PROJECT_ID, 1):
        result = await workflow_module.CreateProjectVersionWorkflow().run(
            CreateProjectVersionInput(project_id=PROJECT_ID, zip_file_id=ZIP_FILE_ID)
        )
        assert current_project_context() == ProjectContext(project_id=str(PROJECT_ID), project_version=1)

    assert result.status == WorkflowStatusEnum.COMPLETED
    assert result.new_version == EXPECTED_NEW_VERSION

    status_updates = [args[3] for name, args in calls if name == "update_dms_zip_approval_status"]
    assert status_updates == ["APPROVING", "APPROVED"]
    assert (
        "get_dms_zip_diff",
        (URL_BY_SERVICE["document_management_service"], PROJECT_ID, ZIP_FILE_ID, 1),
    ) in calls
    assert (
        "cancel_project_version_workflows",
        (PROJECT_ID, 1, ["create-project-version-test", "file-processing-root"]),
    ) in calls

    root_copy_calls = [args for name, args in calls if name == "copy_project_root_version"]
    assert root_copy_calls == [
        (PROJECT_ID, 1, 2, True),
        (PROJECT_ID, 1, 2, False),
    ]

    generated_copy_calls = [args for name, args in calls if name == "copy_service_version_nodes"]
    assert len(generated_copy_calls) == EXPECTED_GENERATED_COPY_CALL_COUNT
    assert {args[6] for args in generated_copy_calls} == {True, False}
    assert URL_BY_SERVICE["document_management_service"] not in {args[0] for args in generated_copy_calls}

    committed_copy_by_url = {args[0]: args[5] for args in generated_copy_calls if args[6] is False}
    assert committed_copy_by_url[URL_BY_SERVICE["project_logic_service"]] == [
        {"node_type": "topic", "id": str(TOPIC_ID)}
    ]
    assert committed_copy_by_url[URL_BY_SERVICE["plausibility_notes"]] == [
        {"node_type": "plausibility_note", "id": str(PLAUSIBILITY_NOTE_ID)}
    ]
    assert committed_copy_by_url[URL_BY_SERVICE["formal_completeness_check"]] == [
        {"node_type": "category", "id": str(FCS_CATEGORY_ID)},
        {"node_type": "project_template_version", "id": str(FCS_PROJECT_TEMPLATE_VERSION_ID)},
        {"node_type": "document_type", "id": str(FCS_DOCUMENT_TYPE_ID)},
        {"node_type": "document", "id": str(FCS_CHANGED_DOCUMENT_ID)},
    ]

    dms_commit_calls = [args for name, args in calls if name == "commit_dms_zip_diff"]
    assert dms_commit_calls == [
        (URL_BY_SERVICE["document_management_service"], PROJECT_ID, ZIP_FILE_ID, 1, 2, "lock-token", True),
        (URL_BY_SERVICE["document_management_service"], PROJECT_ID, ZIP_FILE_ID, 1, 2, "lock-token", False),
    ]

    first_generated_commit_index = next(
        index for index, (name, args) in enumerate(calls) if name == "copy_service_version_nodes" and args[6] is False
    )
    final_dms_commit_index = calls.index(("commit_dms_zip_diff", dms_commit_calls[1]))
    root_commit_index = calls.index(("copy_project_root_version", (PROJECT_ID, 1, 2, False)))
    cancel_index = calls.index(
        (
            "cancel_project_version_workflows",
            (PROJECT_ID, 1, ["create-project-version-test", "file-processing-root"]),
        )
    )
    plan_index = next(
        index for index, (name, _) in enumerate(calls) if name == workflow_module.BUILD_PROJECT_VERSION_COPY_PLAN
    )
    approved_status_index = next(
        index
        for index, (name, args) in enumerate(calls)
        if name == "update_dms_zip_approval_status" and args[3] == "APPROVED"
    )
    release_index = calls.index(("release_project_version_lock", (PROJECT_ID, "lock-token", None)))
    fvp_start_index = next(index for index, (name, _) in enumerate(calls) if name == "start_decoupled_parent_workflow")

    fvp_start_input = calls[fvp_start_index][1][0]
    assert fvp_start_input.workflow_id == FVP_WORKFLOW_ID
    assert fvp_start_input.workflow_input == {"project_id": str(PROJECT_ID)}
    assert fvp_start_input.task_queue == FVP_TASK_QUEUE
    assert fvp_start_input.project_id == PROJECT_ID
    assert fvp_start_input.project_version == EXPECTED_NEW_VERSION
    assert fvp_start_contexts == [ProjectContext(project_id=str(PROJECT_ID), project_version=EXPECTED_NEW_VERSION)]
    assert ("update_project_status", (PROJECT_ID, "IN_PROGRESS")) not in calls

    assert cancel_index < plan_index
    assert (
        root_commit_index
        < first_generated_commit_index
        < final_dms_commit_index
        < approved_status_index
        < release_index
        < fvp_start_index
    )


@pytest.mark.asyncio
async def test_first_upload_approved_zip_commits_dms_diff_without_bumping_project_version(monkeypatch):
    calls: list[tuple[str, tuple]] = []

    async def fake_execute_activity(activity, *_, args=(), **__):
        activity_name = _activity_name(activity)
        calls.append((activity_name, tuple(args)))

        if activity_name == workflow_module.GET_PROJECT_VERSIONING_SERVICE_ENDPOINTS:
            return ENDPOINT_ROWS
        if activity_name == workflow_module.GET_LATEST_PLS_VERSION:
            return 1
        if activity_name == workflow_module.GET_PROJECT_INTERNAL_STATUS:
            return "UPLOAD_DOCUMENTS"
        if activity_name == workflow_module.ACQUIRE_PROJECT_VERSION_LOCK:
            return "lock-token"
        if activity_name == workflow_module.UPDATE_DMS_ZIP_APPROVAL_STATUS:
            return {"ok": True}
        if activity_name == workflow_module.COMMIT_DMS_ZIP_DIFF:
            return {"committed": not args[6]}
        if activity_name == workflow_module.UPDATE_PROJECT_STATUS:
            return {"ok": True}
        if activity_name == workflow_module.RELEASE_PROJECT_VERSION_LOCK:
            return None

        raise AssertionError(f"Unexpected activity: {activity_name}")

    monkeypatch.setattr(workflow_module.workflow, "execute_activity", fake_execute_activity)
    monkeypatch.setattr(
        workflow_module.workflow,
        "logger",
        SimpleNamespace(info=lambda *_, **__: None, exception=lambda *_, **__: None),
    )

    result = await workflow_module.CreateProjectVersionWorkflow().run(
        CreateProjectVersionInput(project_id=PROJECT_ID, zip_file_id=ZIP_FILE_ID)
    )

    assert result.status == WorkflowStatusEnum.COMPLETED
    assert result.new_version == 1

    assert ("acquire_project_version_lock", (PROJECT_ID, 1, 1, ZIP_FILE_ID)) in calls
    assert (
        "commit_dms_zip_diff",
        (URL_BY_SERVICE["document_management_service"], PROJECT_ID, ZIP_FILE_ID, 1, 1, "lock-token", True),
    ) in calls
    assert (
        "commit_dms_zip_diff",
        (URL_BY_SERVICE["document_management_service"], PROJECT_ID, ZIP_FILE_ID, 1, 1, "lock-token", False),
    ) in calls
    assert ("update_project_status", (PROJECT_ID, "OPEN")) in calls
    assert not any(name == "list_service_nodes" for name, _ in calls)
    assert not any(name == "copy_service_version_nodes" for name, _ in calls)
    assert not any(name == "copy_project_root_version" for name, _ in calls)

    status_updates = [args[3] for name, args in calls if name == "update_dms_zip_approval_status"]
    assert status_updates == ["APPROVING", "APPROVED"]


@pytest.mark.asyncio
async def test_failure_after_project_root_copy_undoes_generated_cleanup_before_root(monkeypatch):  # noqa: C901
    calls: list[tuple[str, tuple]] = []

    async def fake_execute_activity(activity, *_, args=(), **__):  # noqa: C901
        activity_name = _activity_name(activity)
        calls.append((activity_name, tuple(args)))

        if activity_name == workflow_module.GET_PROJECT_VERSIONING_SERVICE_ENDPOINTS:
            return ENDPOINT_ROWS
        if activity_name == workflow_module.GET_LATEST_PLS_VERSION:
            return 1
        if activity_name == workflow_module.GET_PROJECT_INTERNAL_STATUS:
            return "OPEN"
        if activity_name == workflow_module.ACQUIRE_PROJECT_VERSION_LOCK:
            return "lock-token"
        if activity_name == workflow_module.CANCEL_PROJECT_VERSION_WORKFLOWS:
            return {"cancelled": [], "skipped": args[2]}
        if activity_name == workflow_module.UPDATE_DMS_ZIP_APPROVAL_STATUS:
            if args[3] == "APPROVED":
                raise RuntimeError("approval status failed")
            return {"ok": True}
        if activity_name == workflow_module.GET_DMS_ZIP_DIFF:
            return {
                "deleted": [],
                "changed": [],
                "renamed": [],
            }
        if activity_name == workflow_module.BUILD_PROJECT_VERSION_COPY_PLAN:
            return {"survivors_per_service": {}, "deleted_file_ids": [], "deleted_keys_count": 0}
        if activity_name == workflow_module.COPY_SERVICE_VERSION_NODES:
            return {"copied": 0}
        if activity_name == workflow_module.COMMIT_DMS_ZIP_DIFF:
            return {"committed": not args[6]}
        if activity_name == workflow_module.COPY_PROJECT_ROOT_VERSION:
            return {"copied": 1}
        if activity_name == workflow_module.UNDO_PROJECT_ROOT_VERSION:
            return {"project": 1}
        if activity_name == workflow_module.UNDO_SERVICE_VERSION:
            return {"deleted": {}}
        if activity_name == workflow_module.RELEASE_PROJECT_VERSION_LOCK:
            return None

        raise AssertionError(f"Unexpected activity: {activity_name}")

    monkeypatch.setattr(workflow_module.workflow, "execute_activity", fake_execute_activity)
    monkeypatch.setattr(
        workflow_module.workflow,
        "logger",
        SimpleNamespace(info=lambda *_, **__: None, exception=lambda *_, **__: None),
    )
    monkeypatch.setattr(
        workflow_module.workflow,
        "info",
        lambda: SimpleNamespace(
            workflow_id="create-project-version-test",
            run_id="run-1",
            root=SimpleNamespace(workflow_id="file-processing-root"),
            parent=None,
        ),
    )

    with pytest.raises(RuntimeError, match="approval status failed"), use_project_context(PROJECT_ID, 1):
        await workflow_module.CreateProjectVersionWorkflow().run(
            CreateProjectVersionInput(project_id=PROJECT_ID, zip_file_id=ZIP_FILE_ID)
        )

    root_commit_index = calls.index(("copy_project_root_version", (PROJECT_ID, 1, 2, False)))
    root_undo_index = calls.index(("undo_project_root_version", (PROJECT_ID, 2)))
    first_generated_undo_index = next(index for index, (name, _) in enumerate(calls) if name == "undo_service_version")
    dms_undo_index = calls.index(
        ("undo_service_version", (URL_BY_SERVICE["document_management_service"], PROJECT_ID, 2, "lock-token"))
    )
    failed_status_index = next(
        index
        for index, (name, args) in enumerate(calls)
        if name == "update_dms_zip_approval_status" and args[3] == "FAILED_APPROVE"
    )
    release_index = next(
        index
        for index, (name, args) in enumerate(calls)
        if name == "release_project_version_lock" and args[2] == "approval status failed"
    )

    assert root_commit_index < first_generated_undo_index
    assert first_generated_undo_index < root_undo_index < failed_status_index < release_index
    assert dms_undo_index < root_undo_index
