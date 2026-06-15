from typing import Annotated
from uuid import UUID

from authentification.auth import AuthClient
from authentification.auth_utils import check_permission
from authentification.dependencies import (
    get_auth_client,
    get_current_user,
    get_verifier,
    require_permissions,
    require_role,
)
from authentification.enums import AuthMode, OidcRoles, Permission, Resource
from authentification.models import OidcUserInfo
from authentification.resolver import query_param
from authentification.verifier import OidcVerifier
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from src.api.dependencies import get_zip_file_service
from src.models.db.workflow_enum import WorkflowStatusEnum, ZipFileTypeEnum
from src.models.schemas.file_schema import ZipFileResponse
from src.services.zip_files.zip_file_service import ZipFileService

router = APIRouter(prefix="/v2/zip-files", tags=["Zip Files"])
AUTHENTICATED_ROLES = [OidcRoles.SERVICE, OidcRoles.USER, OidcRoles.ADMIN]


@router.get(
    "",
    response_model=list[ZipFileResponse],
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.READ, query_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def list_zip_files(
    project_version: Annotated[int, Query(ge=1)],
    project_id: Annotated[UUID | None, Query(alias="projectId")] = None,
    workflow_status: Annotated[WorkflowStatusEnum | None, Query(alias="workflowStatus")] = None,
    file_type: Annotated[ZipFileTypeEnum | None, Query(alias="fileType")] = None,
    page: Annotated[int, Query(ge=1, le=10_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=500)] = 50,
    service: ZipFileService = Depends(get_zip_file_service),
):
    """List zip files with optional project and workflow status filtering."""
    zip_files = await service.list_zip_files(
        project_id=project_id,
        project_version=project_version,
        file_type=file_type,
        workflow_status=workflow_status,
        page=page,
        page_size=page_size,
    )
    return [zf.__dict__ for zf in zip_files]


@router.get(
    "/{zip_file_id}",
    response_model=ZipFileResponse,
    dependencies=[Depends(require_role(allowed_roles=AUTHENTICATED_ROLES))],
)
async def get_zip_file(
    zip_file_id: UUID,
    response: Response,
    project_version: Annotated[int | None, Query(ge=1)] = None,
    service: ZipFileService = Depends(get_zip_file_service),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
    verifier: OidcVerifier = Depends(get_verifier),
):
    """Retrieve a zip file by its UUID."""
    zip_file = await service.get_zip_file(
        zip_file_id=zip_file_id,
        project_version=project_version,
    )
    if not zip_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Zip file not found",
        )
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
    return zip_file.__dict__
