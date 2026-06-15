from typing import Annotated
from uuid import UUID

from audit_client import audit_context_kwargs
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
from authentification.resolver import body_field, query_param
from authentification.verifier import OidcVerifier
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from src.api.dependencies import get_file_service
from src.models.db.file_enum import FileTypeEnum
from src.models.schemas.file_schema import (
    FileDownloadResponse,
    FileResponse,
    FileUpdateRequest,
    FileUploadUrlResponse,
    PublicUploadRequest,
    StartFileProcessingRequest,
    StartFileProcessingResponse,
    ZipFileResponse,
)
from src.services.files.file_service import FileService

router = APIRouter(prefix="/v2/files", tags=["Files"])
AUTHENTICATED_ROLES = [OidcRoles.SERVICE, OidcRoles.USER, OidcRoles.ADMIN]


@router.post(
    "/confirm-upload",
    response_model=FileResponse | ZipFileResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.CREATE, body_field("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def confirm_upload(
    payload: PublicUploadRequest,
    request: Request,
    project_version: Annotated[int | None, Query()] = None,
    service: FileService = Depends(get_file_service),
):
    """
    Confirm that a file upload has completed and persist its metadata.

    Args:
        payload (PublicUploadRequest): Metadata for the uploaded file
        service (FileService): FileService instance

    Returns:
        FileResponse | ZipFileResponse: Metadata of the confirmed file or zip file
    """
    created = await service.confirm_upload(
        file_data=payload,
        project_version=project_version,
        audit_context=audit_context_kwargs(request),
    )
    return created.__dict__


@router.get(
    "/{file_id}",
    response_model=FileResponse,
    dependencies=[Depends(require_role(allowed_roles=AUTHENTICATED_ROLES))],
)
async def get_file(
    file_id: UUID,
    response: Response,
    project_version: Annotated[int, Query(ge=1)],
    service: FileService = Depends(get_file_service),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
    verifier: OidcVerifier = Depends(get_verifier),
):
    """
    Retrieve a file by its UUID.

    Args:
        file_id (UUID): UUID of the file to retrieve
        service (FileService): FileService instance

    Returns:
        FileResponse: File metadata
    """
    file = await service.get_file(file_id=file_id, project_version=project_version)
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )
    if user_info:
        await check_permission(
            user=user_info,
            resource_type=Resource.PROJECT,
            resource_id=str(file.project_id),
            permission=Permission.READ,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            auth_client=auth_client,
            response=response,
            dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        )
    return file.__dict__


@router.get(
    "/{file_id}/versions",
    response_model=list[FileResponse],
    dependencies=[Depends(require_role(allowed_roles=AUTHENTICATED_ROLES))],
)
async def get_versions(
    file_id: UUID,
    response: Response,
    service: FileService = Depends(get_file_service),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
    verifier: OidcVerifier = Depends(get_verifier),
):
    """
    Retrieve all versions of a file by its UUID.

    Args:
        file_id (UUID): UUID of the file versions to retrieve
        service (FileService): FileService instance

    Returns:
        list[FileResponse]: List of file metadata
    """
    files = await service.get_versions(file_id=file_id)
    if not files:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )
    if user_info:
        await check_permission(
            user=user_info,
            resource_type=Resource.PROJECT,
            resource_id=str(files[0].project_id),
            permission=Permission.READ,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            auth_client=auth_client,
            response=response,
            dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        )
    return [file.__dict__ for file in files]


@router.patch(
    "/{file_id}",
    response_model=FileResponse,
    dependencies=[Depends(require_role(allowed_roles=AUTHENTICATED_ROLES))],
)
async def update_file(
    file_id: UUID,
    payload: FileUpdateRequest,
    response: Response,
    request: Request,
    project_version: Annotated[int, Query(ge=1)],
    service: FileService = Depends(get_file_service),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
    verifier: OidcVerifier = Depends(get_verifier),
):
    """
    Update fields of an existing file.

    Args:
        file_id (UUID): UUID of the file to update
        payload (FileUpdateRequest): Data to update on the file
        service (FileService): FileService instance

    Returns:
        FileResponse: The updated file metadata
    """
    if user_info:
        file = await service.get_file(
            file_id=file_id,
            project_version=project_version,
        )
        await check_permission(
            user=user_info,
            resource_type=Resource.PROJECT,
            resource_id=str(file.project_id),
            permission=Permission.UPDATE,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            auth_client=auth_client,
            response=response,
            dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        )

    updated = await service.update_file(
        file_id=file_id,
        update_data=payload,
        project_version=project_version,
        audit_context=audit_context_kwargs(request),
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )

    return updated.__dict__


@router.delete(
    "/{file_id}",
    response_model=FileResponse,
    dependencies=[Depends(require_role(allowed_roles=AUTHENTICATED_ROLES))],
)
async def delete_file(
    file_id: UUID,
    response: Response,
    request: Request,
    project_version: Annotated[int, Query(ge=1)],
    service: FileService = Depends(get_file_service),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
    verifier: OidcVerifier = Depends(get_verifier),
):
    """
    Soft delete a file by its UUID.

    Args:
        file_id (UUID): UUID of the file to delete
        service (FileService): FileService instance

    Returns:
        FileResponse: Metadata of the deleted file
    """
    if user_info:
        file = await service.get_file(
            file_id=file_id,
            project_version=project_version,
        )
        await check_permission(
            user=user_info,
            resource_type=Resource.PROJECT,
            resource_id=str(file.project_id),
            permission=Permission.DELETE,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            auth_client=auth_client,
            response=response,
            dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        )
    file = await service.delete_file(
        file_id=file_id,
        project_version=project_version,
        audit_context=audit_context_kwargs(request),
    )
    return file.__dict__


@router.get(
    "/{file_id}/generate-download-url",
    response_model=FileDownloadResponse,
    dependencies=[Depends(require_role(allowed_roles=AUTHENTICATED_ROLES))],
)
async def generate_download_url(
    file_id: UUID,
    response: Response,
    project_version: Annotated[int, Query(ge=1)],
    inline: Annotated[bool, Query()] = False,
    include_deleted: Annotated[bool, Query(alias="includeDeleted")] = False,
    service: FileService = Depends(get_file_service),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
    verifier: OidcVerifier = Depends(get_verifier),
):
    """
    Generate a signed URL to download a file by its UUID.

    Args:
        file_id (UUID): UUID of the file to download
        inline (bool, optional): If True, the file will be displayed inline
            in the browser.
        include_deleted (bool): If True, allows to download soft deleted files
        service (FileService): FileService instance

    Returns:
        FileDownloadResponse: File metadata with a signed download URL
    """
    file, url = await service.generate_download_url(
        file_id=file_id,
        inline=inline,
        include_deleted=include_deleted,
        project_version=project_version,
    )
    if user_info:
        await check_permission(
            user=user_info,
            resource_type=Resource.PROJECT,
            resource_id=str(file.project_id),
            permission=Permission.READ,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            auth_client=auth_client,
            response=response,
            dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        )
    return FileDownloadResponse(download_url=url)


@router.post(
    "/start-file-processing",
    response_model=StartFileProcessingResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.CREATE, body_field("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def start_file_processing(
    payload: StartFileProcessingRequest,
    request: Request,
    service: FileService = Depends(get_file_service),
):
    """
    Start a Temporal file-processing workflow for an uploaded ZIP.

    The ZIP row is inferred from `file_id` + `project_id` and then extracted so each
    contained file is processed individually.
    """
    return await service.start_file_processing(
        payload,
        audit_context=audit_context_kwargs(request),
    )


@router.post(
    "/generate-upload-url",
    response_model=FileUploadUrlResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.CREATE, body_field("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def generate_upload_url(
    file_data: PublicUploadRequest,
    project_version: Annotated[int | None, Query()] = None,
    service: FileService = Depends(get_file_service),
):
    """
    Generate a signed URL to upload a file.

    Args:
        file_data (PublicUploadRequest): Name of the file
        service (FileService): FileService instance

    Returns:
        FileUploadUrlResponse: Signed upload URL and MIME type
    """
    url, mime_type = await service.generate_upload_url(file_data=file_data, project_version=project_version)

    return FileUploadUrlResponse(
        upload_url=url,
        mime_type=mime_type,
    )


@router.get(
    "",
    response_model=list[FileResponse],
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.READ, query_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def list_files(
    file_type: FileTypeEnum,
    project_version: Annotated[int, Query(ge=1)],
    project_id: Annotated[UUID | None, Query(alias="projectId")] = None,
    name: Annotated[
        str | None,
        Query(description="Optional search string for filename (SQL ilike)"),
    ] = None,
    path: Annotated[
        str | None,
        Query(description="Optional search string for bucket path (contains)"),
    ] = None,
    topic_ids: Annotated[
        list[UUID] | None,
        Query(alias="topicIds", description="Optional filter by topic IDs"),
    ] = None,
    include_deleted: Annotated[bool, Query(alias="includeDeleted")] = False,
    page: Annotated[int, Query(ge=1, le=10_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=500)] = 50,
    service: FileService = Depends(get_file_service),
):
    """
    Get a list of all files.

    Args:
        file_type (FileTypeEnum): File type
        project_id (UUID | None): Optional project filter
        name (str | None): Optional name filter
        path (str | None): Optional path filter
        topic_ids (list[UUID | None]): Optional topic filter
        include_deleted (bool): include deleted files
        page_size (int): Optional page size
        page (int): Optional page number
        service (FileService): FileService instance

    Returns:
        list[FileResponse]: List of files matching filters
    """
    files = await service.list_files(
        project_id=project_id,
        project_version=project_version,
        name=name,
        path=path,
        file_type=file_type,
        include_deleted=include_deleted,
        topic_ids=topic_ids,
        page=page,
        page_size=page_size,
    )
    return [file.__dict__ for file in files]
