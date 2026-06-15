"""API routes for argument import/export."""

from uuid import UUID

from authentification.dependencies import require_permissions
from authentification.enums import OidcRoles, Permission, Resource
from authentification.resolver import path_param
from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db.database import get_db_session
from src.models.schemas.objection_schemas import (
    ErwiderungImportResponse,
    FileIdRequest,
    FileIdResponse,
)
from src.services import objection_service

router = APIRouter(prefix="/{project_id}/arguments", tags=["Arguments"])


@router.get(
    "/export",
    response_model=FileIdResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.EXPORT, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def export_arguments(
    project_id: UUID,
    db: AsyncSession = Depends(get_db_session),
) -> FileIdResponse:
    """Export project arguments as a DMS-backed Erwiderung CSV."""
    return await objection_service.export_arguments_to_dms(
        project_id=project_id,
        db=db,
    )


@router.post(
    "/import",
    response_model=ErwiderungImportResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.CREATE, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def import_arguments(
    project_id: UUID,
    body: FileIdRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> ErwiderungImportResponse:
    """Import Erwiderungen from a DMS-backed CSV file."""
    return await objection_service.import_arguments_from_dms(
        project_id=project_id,
        file_id=body.file_id,
        db=db,
        request=request,
    )
