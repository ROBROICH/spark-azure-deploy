from typing import Literal, cast
from uuid import UUID

from audit_client import ChangeType, audit_context_kwargs, record_audit_entry
from authentification.auth import AuthClient
from authentification.auth_utils import check_permission
from authentification.dependencies import get_auth_client, get_current_user, get_verifier, require_role
from authentification.enums import AuthMode, OidcRoles, Permission, Resource
from authentification.models import OidcUserInfo
from authentification.verifier import OidcVerifier
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from temporal import start_workflow, stop_workflow
from temporal.workflows.project_versioning.project_versioning import CREATE_PROJECT_VERSION_WORKFLOW_ID
from temporal.workflows.project_versioning.types import CreateProjectVersionInput, CreateProjectVersionOutput
from temporalio.common import WorkflowIDConflictPolicy, WorkflowIDReusePolicy

from src.api.dependencies import get_zip_file_service
from src.config.settings import settings
from src.models.db.workflow_enum import ApprovalStatus, ZipApprovalStatus
from src.models.schemas.approval_schema import (
    ApprovalActionResponse,
    CancelResponse,
    FileDiffResponse,
)
from src.services.zip_files.zip_file_service import ZipFileService

router = APIRouter(prefix="/v2/files", tags=["File Approval"])
AUTHENTICATED_ROLES = [OidcRoles.SERVICE, OidcRoles.USER, OidcRoles.ADMIN]


async def _record_zip_action(
    zip_file_service: ZipFileService,
    *,
    project_id: UUID | None,
    file_id: UUID,
    action_type: str,
    request: Request,
) -> None:
    if project_id is None:
        return
    await record_audit_entry(
        zip_file_service.db,
        project_id=project_id,
        entity_type="zip_file",
        change_type=ChangeType.ACTION,
        action_type=action_type,
        entity_id=file_id,
        **audit_context_kwargs(request),
    )
    await zip_file_service.db.commit()


@router.get(
    "/{file_id}/approval-status",
    response_model=ZipApprovalStatus | None,
    summary="Get current ZIP approval status",
    dependencies=[Depends(require_role(allowed_roles=AUTHENTICATED_ROLES))],
)
async def get_file_approval_status(
    file_id: UUID,
    response: Response,
    zip_file_service: ZipFileService = Depends(get_zip_file_service),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
    verifier: OidcVerifier = Depends(get_verifier),
):
    """
    Returns the current approval status.

    Useful for frontend polling while waiting for user decision.
    """
    zip_file = await zip_file_service.get_zip_file(file_id)
    if zip_file is None:
        return None

    if user_info:
        await check_permission(
            user=user_info,
            resource_type=Resource.PROJECT,
            resource_id=str(zip_file.project_id),
            permission=Permission.READ,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            auth_client=auth_client,
            response=response,
            dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        )
    return zip_file.approval_status


@router.post(
    "/{file_id}/decision",
    response_model=ApprovalActionResponse,
    dependencies=[Depends(require_role(allowed_roles=AUTHENTICATED_ROLES))],
)
async def submit_approval(
    file_id: UUID,
    decision: Literal["approve", "reject"],
    request: Request,
    response: Response,
    zip_file_service: ZipFileService = Depends(get_zip_file_service),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
    verifier: OidcVerifier = Depends(get_verifier),
):
    """
    Single endpoint for both approve & reject actions.
    Useful for simpler frontend forms.
    """
    zip_file = await zip_file_service.get_zip_file(file_id)
    if zip_file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ZIP file not found")

    if user_info:
        await check_permission(
            user=user_info,
            resource_type=Resource.PROJECT,
            resource_id=str(zip_file.project_id),
            permission=Permission.CREATE,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            auth_client=auth_client,
            response=response,
            dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        )

    if decision == "reject":
        await zip_file_service.update_zip_approval_status(file_id, ZipApprovalStatus.REJECTED)
        await _record_zip_action(
            zip_file_service,
            project_id=zip_file.project_id,
            file_id=file_id,
            action_type="submit_approval_reject",
            request=request,
        )
        return ApprovalActionResponse(
            status="success",
            message=f"ZIP approval rejected for file {file_id}",
            current_approval_status=ApprovalStatus.REJECTED,
            zip_approval_status=ZipApprovalStatus.REJECTED,
        )
    if decision == "approve":
        if zip_file.approval_status == ZipApprovalStatus.APPROVED:
            return ApprovalActionResponse(
                status="already_processed",
                message=f"ZIP approval already completed for file {file_id}",
                current_approval_status=ApprovalStatus.APPROVED,
                zip_approval_status=ZipApprovalStatus.APPROVED,
            )
        if zip_file.approval_status not in (ZipApprovalStatus.REQUIRES_APPROVAL, ZipApprovalStatus.APPROVING):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"ZIP file is not awaiting approval: {zip_file.approval_status}",
            )
        project_id = cast(UUID, zip_file.project_id)
        source_project_version = zip_file.source_project_version
        workflow_id = f"{CREATE_PROJECT_VERSION_WORKFLOW_ID}-{file_id}"
        try:
            handle = await start_workflow(
                workflow_id=CREATE_PROJECT_VERSION_WORKFLOW_ID,
                input=CreateProjectVersionInput(
                    project_id=project_id,
                    zip_file_id=file_id,
                ),
                task_queue=settings.TEMPORAL.PLS_TASK_QUEUE,
                project_id=str(project_id),
                project_version=source_project_version,
                id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
                id_conflict_policy=WorkflowIDConflictPolicy.USE_EXISTING,
                _ORCHESTRATOR_ONLY_DO_NOT_USE_OR_YOU_WILL_GET_FIRED_ID=workflow_id,
            )
            result = await handle.result()
        except Exception as exc:
            zip_file = await zip_file_service.get_zip_file(file_id)
            return ApprovalActionResponse(
                status="failed",
                message=f"ZIP approval failed for file {file_id}: {exc}",
                current_approval_status=ApprovalStatus.REJECTED,
                zip_approval_status=zip_file.approval_status if zip_file else ZipApprovalStatus.FAILED_APPROVE,
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Decision must be 'approve' or 'reject'",
        )

    zip_file = await zip_file_service.get_zip_file(file_id)
    output = CreateProjectVersionOutput.model_validate(result)
    if output.new_version is None:
        return ApprovalActionResponse(
            status="failed",
            message=f"ZIP approval failed for file {file_id}: workflow completed without a new version",
            current_approval_status=ApprovalStatus.REJECTED,
            zip_approval_status=zip_file.approval_status if zip_file else ZipApprovalStatus.FAILED_APPROVE,
        )
    await _record_zip_action(
        zip_file_service,
        project_id=zip_file.project_id if zip_file else None,
        file_id=file_id,
        action_type="submit_approval_approve",
        request=request,
    )
    return ApprovalActionResponse(
        status="success",
        message=f"ZIP approval completed for file {file_id}",
        current_approval_status=ApprovalStatus.APPROVED,
        zip_approval_status=zip_file.approval_status if zip_file else None,
        new_version=output.new_version,
    )


@router.get(
    "/{file_id}/diff",
    response_model=FileDiffResponse | None,
    summary="Get the diff of the project files",
    description=("Takes the uploaded file or files and creates a diff to current project files."),
    dependencies=[Depends(require_role(allowed_roles=AUTHENTICATED_ROLES))],
)
async def get_file_diff(
    file_id: UUID,
    response: Response,
    zip_file_service: ZipFileService = Depends(get_zip_file_service),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
    verifier: OidcVerifier = Depends(get_verifier),
):
    """
    Returns the current file diff of the project files.
    """
    if user_info:
        zip_file = await zip_file_service.get_zip_file(file_id)
        await check_permission(
            user=user_info,
            resource_type=Resource.PROJECT,
            resource_id=str(zip_file.project_id),
            permission=Permission.READ,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            auth_client=auth_client,
            response=response,
            dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        )
    return await zip_file_service.get_file_diff(file_id)


@router.post(
    "/{file_id}/diff",
    response_model=FileDiffResponse,
    summary="Set the diff of the project files",
    description="Can be used to modify a diff to current project files.",
    dependencies=[Depends(require_role(allowed_roles=AUTHENTICATED_ROLES))],
)
async def set_file_diff(
    file_id: UUID,
    diff: FileDiffResponse,
    request: Request,
    response: Response,
    zip_file_service: ZipFileService = Depends(get_zip_file_service),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
    verifier: OidcVerifier = Depends(get_verifier),
):
    """
    Sets the diff of the project files.
    """
    zip_file = await zip_file_service.get_zip_file(file_id)
    if zip_file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ZIP file not found")

    if user_info:
        await check_permission(
            user=user_info,
            resource_type=Resource.PROJECT,
            resource_id=str(zip_file.project_id),
            permission=Permission.CREATE,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            auth_client=auth_client,
            response=response,
            dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        )
    file_diff = await zip_file_service.set_file_diff(zip_file_id=file_id, diff=diff)
    await _record_zip_action(
        zip_file_service,
        project_id=zip_file.project_id,
        file_id=file_id,
        action_type="set_file_diff",
        request=request,
    )
    return file_diff


@router.post(
    "/{file_id}/cancel",
    summary="Cancel an upload process",
    dependencies=[Depends(require_role(allowed_roles=AUTHENTICATED_ROLES))],
)
async def cancel_upload_process(
    file_id: UUID,
    request: Request,
    response: Response,
    zip_file_service: ZipFileService = Depends(get_zip_file_service),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
    verifier: OidcVerifier = Depends(get_verifier),
):
    """
    Cancel a running upload process.
    """
    zip_file = await zip_file_service.get_zip_file(file_id)
    if zip_file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ZIP file not found")

    if user_info:
        await check_permission(
            user=user_info,
            resource_type=Resource.PROJECT,
            resource_id=str(zip_file.project_id),
            permission=Permission.CREATE,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            auth_client=auth_client,
            response=response,
            dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        )
    await stop_workflow(str(file_id))
    await _record_zip_action(
        zip_file_service,
        project_id=zip_file.project_id,
        file_id=file_id,
        action_type="cancel_upload_process",
        request=request,
    )
    return CancelResponse(file_id=file_id, success=True)
