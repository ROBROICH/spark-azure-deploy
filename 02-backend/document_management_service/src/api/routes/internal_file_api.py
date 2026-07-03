from typing import Annotated
from uuid import UUID

from audit_client import audit_context_kwargs
from authentification.dependencies import require_role
from authentification.enums import OidcRoles
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from node_crud import build_http_version_lock_validator
from pydantic import BaseModel, Field

from src.api.dependencies import get_file_service, get_zip_file_service
from src.config.settings import settings
from src.models.db.workflow_enum import ZipApprovalStatus
from src.models.schemas.approval_schema import FileDiffResponse
from src.models.schemas.file_schema import (
    FileDownloadResponse,
    FileResponse,
    FileUploadUrlResponse,
    UploadRequest,
    ZipFileResponse,
)
from src.services.files.file_service import FileService
from src.services.zip_files.zip_file_service import ZipFileService


class CommitDiffRequest(BaseModel):
    source_version: int = Field(..., ge=1)
    target_version: int = Field(..., ge=1)
    lock_token: str = Field(..., min_length=1)
    dry_run: bool


class CommitDiffResponse(BaseModel):
    dry_run: bool
    new: int
    changed: int
    renamed: int
    unchanged: int


class ZipApprovalStatusRequest(BaseModel):
    approval_status: ZipApprovalStatus
    error: str | None = None


class ZipApprovalStatusResponse(BaseModel):
    approval_status: ZipApprovalStatus
    error: str | None = None


async def reject_authorization_header(authorization: str | None = Header(default=None)) -> None:
    if authorization:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Internal endpoint")


validate_project_version_lock = build_http_version_lock_validator(settings.PROJECT_LOGIC_SERVICE_URL)

router = APIRouter(
    prefix="/v2/internal/files",
    tags=["Internal Files"],
    dependencies=[
        Depends(reject_authorization_header),
        Depends(require_role(allowed_roles=[OidcRoles.SERVICE])),
    ],
)


@router.post("/confirm-upload", response_model=FileResponse | ZipFileResponse)
async def internal_confirm_upload(
    payload: UploadRequest,
    request: Request,
    project_version: Annotated[int | None, Query()] = None,
    service: FileService = Depends(get_file_service),
):
    """Confirm upload — internal, accepts all file types including internal ones."""
    created = await service.confirm_upload(
        file_data=payload,
        project_version=project_version,
        audit_context=audit_context_kwargs(request),
    )
    return created.__dict__


@router.post("/generate-upload-url", response_model=FileUploadUrlResponse)
async def internal_generate_upload_url(
    file_data: UploadRequest,
    project_version: Annotated[int | None, Query()] = None,
    service: FileService = Depends(get_file_service),
):
    """Generate signed upload URL — internal, accepts all file types."""
    url, mime_type = await service.generate_upload_url(file_data=file_data, project_version=project_version)
    return FileUploadUrlResponse(upload_url=url, mime_type=mime_type)


@router.get("/{file_id}/generate-download-url", response_model=FileDownloadResponse)
async def internal_generate_download_url(
    file_id: UUID,
    project_version: Annotated[int | None, Query()] = None,
    inline: Annotated[bool, Query()] = False,
    include_deleted: Annotated[bool, Query(alias="includeDeleted")] = False,
    service: FileService = Depends(get_file_service),
):
    """Generate a signed download URL for service-to-service use.

    Signs against the internal storage endpoint (S3_ENDPOINT_URL) so server-side
    callers can reach it, unlike the public route which targets the browser-facing
    host, which is unreachable from backend workers when internal and external
    storage endpoints differ.
    """
    _, url = await service.generate_download_url(
        file_id=file_id,
        inline=inline,
        include_deleted=include_deleted,
        project_version=project_version,
        internal=True,
    )
    return FileDownloadResponse(download_url=url)


@router.get("/{project_id}/zips/{zip_file_id}/diff", response_model=FileDiffResponse | None)
async def internal_get_zip_diff(
    project_id: UUID,
    zip_file_id: UUID,
    source_version: Annotated[int, Query(ge=1)],
    service: ZipFileService = Depends(get_zip_file_service),
):
    zip_file = await service.get_zip_file(zip_file_id, project_version=source_version)
    if zip_file is None or zip_file.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ZIP file not found")
    return await service.get_file_diff(zip_file_id, project_version=source_version)


@router.patch("/{project_id}/zips/{zip_file_id}/approval-status", response_model=ZipApprovalStatusResponse)
async def internal_update_zip_approval_status(
    project_id: UUID,
    zip_file_id: UUID,
    payload: ZipApprovalStatusRequest,
    service: ZipFileService = Depends(get_zip_file_service),
):
    zip_file = await service.get_zip_file(zip_file_id)
    if zip_file is None or zip_file.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ZIP file not found")
    await service.update_zip_approval_status(
        zip_file_id,
        payload.approval_status,
        error=payload.error,
    )
    return ZipApprovalStatusResponse(approval_status=payload.approval_status, error=payload.error)


@router.post("/{project_id}/zips/{zip_file_id}/commit-diff", response_model=CommitDiffResponse)
async def internal_commit_diff(
    project_id: UUID,
    zip_file_id: UUID,
    payload: CommitDiffRequest,
    service: FileService = Depends(get_file_service),
):
    """Dry-run or commit DMS file-row transitions for an approved ZIP diff."""
    try:
        await validate_project_version_lock(
            project_id,
            payload.source_version,
            payload.target_version,
            payload.lock_token,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    result = await service.commit_zip_diff(
        zip_file_id=zip_file_id,
        project_id=project_id,
        source_version=payload.source_version,
        target_version=payload.target_version,
        dry_run=payload.dry_run,
    )
    return CommitDiffResponse(**result)
