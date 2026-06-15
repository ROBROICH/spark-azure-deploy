"""Internal API routes for FPP service."""

from uuid import UUID

from authentification.dependencies import require_role
from authentification.enums import OidcRoles
from fastapi import APIRouter, Depends, Path, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db.database import get_db_session
from src.models.schemas.fpp_schemas import FPPFileResponse, FPPRequestDetail
from src.services import fpp_service

router = APIRouter(prefix="/internal/fpp", tags=["FPP Internal"])


class ConfirmDownloadRequest(BaseModel):
    """Request to confirm file download."""

    dms_file_id: UUID


@router.get(
    "/requests/{request_id}",
    response_model=FPPRequestDetail,
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.SERVICE]))],
)
async def get_request_details(
    request_id: UUID = Path(..., description="FPP request ID"),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get detailed information about an FPP request.

    This endpoint is for internal use by other services.

    Args:
        request_id: FPP request ID
        db: Database session

    Returns:
        FPPRequestDetail: Detailed request information including all fields and files
    """
    return await fpp_service.get_request(request_id=request_id, db=db)


@router.get(
    "/files/{request_id}",
    response_model=list[FPPFileResponse],
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.SERVICE]))],
)
async def get_request_files(
    request_id: UUID = Path(..., description="FPP request ID"),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get file URLs for an FPP request.

    This endpoint is for internal use by other services (e.g., document_management_service).

    Args:
        request_id: FPP request ID
        db: Database session

    Returns:
        List of file information with URLs
    """
    files = await fpp_service.get_request_files(request_id=request_id, db=db)
    return [FPPFileResponse.model_validate(file) for file in files]


@router.post(
    "/files/{file_id}/confirm-download",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.SERVICE]))],
)
async def confirm_file_download(
    request: ConfirmDownloadRequest,
    file_id: UUID = Path(..., description="FPP file ID"),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Confirm that a file has been downloaded and uploaded to DMS.

    This endpoint is called by the agent_orchestration_service after successfully
    downloading and uploading a file to the document management service.

    Args:
        file_id: FPP file ID
        request: Confirmation request with DMS file ID
        db: Database session

    Returns:
        Success confirmation
    """
    await fpp_service.confirm_file_download(
        file_id=file_id,
        dms_file_id=request.dms_file_id,
        db=db,
    )
    return {"status": "confirmed", "file_id": file_id, "dms_file_id": request.dms_file_id}
