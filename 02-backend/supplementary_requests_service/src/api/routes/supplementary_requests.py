"""API routes for supplementary requests."""

from uuid import UUID

from audit_client import audit_context_kwargs
from authentification.dependencies import require_permissions
from authentification.enums import OidcRoles, Permission, Resource
from authentification.resolver import path_param
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db.database import get_db_session
from src.models.db.db_models import SupplementaryRequest
from src.models.db.enums import SourceType
from src.models.schemas.supplementary_request_schemas import (
    CreateSupplementaryRequestRequest,
    SupplementaryRequestResponse,
    UpdateSupplementaryRequestRequest,
)
from src.services.supplementary_requests import supplementary_request_service

router = APIRouter(
    prefix="/projects/{project_id}/supplementary-requests",
    tags=["Supplementary Requests"],
)


@router.get(
    "",
    response_model=list[SupplementaryRequestResponse],
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.READ, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def list_supplementary_requests(
    project_id: UUID,
    source_type: list[SourceType] | None = Query(None),
    included_in_letter: bool | None = Query(None),
    sort: str = Query("created_at:asc"),
    limit: int | None = Query(None, ge=1, le=100),
    offset: int | None = Query(None, ge=0),
    db: AsyncSession = Depends(get_db_session),
) -> list[SupplementaryRequest]:
    """List supplementary requests for a project with optional filtering."""
    return await supplementary_request_service.list_supplementary_requests_for_project(
        db=db,
        project_id=project_id,
        source_types=source_type,
        included_in_letter=included_in_letter,
        sort=sort,
        limit=limit,
        offset=offset,
    )


@router.post(
    "",
    response_model=SupplementaryRequestResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.CREATE, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def create_supplementary_request(
    project_id: UUID,
    payload: CreateSupplementaryRequestRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> SupplementaryRequest:
    """Create a new supplementary request for a project."""
    return await supplementary_request_service.create_supplementary_request(
        db=db,
        project_id=project_id,
        request_data=payload,
        audit_context=audit_context_kwargs(request),
    )


@router.patch(
    "/{request_id}",
    response_model=SupplementaryRequestResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.UPDATE, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def update_supplementary_request(
    project_id: UUID,
    request_id: UUID,
    payload: UpdateSupplementaryRequestRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> SupplementaryRequest:
    """Update a supplementary request."""
    return await supplementary_request_service.update_supplementary_request_for_project(
        db=db,
        project_id=project_id,
        request_id=request_id,
        update_data=payload,
        audit_context=audit_context_kwargs(request),
    )


@router.delete(
    "/{request_id}",
    response_model=SupplementaryRequestResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.DELETE, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def delete_supplementary_request(
    project_id: UUID,
    request_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> SupplementaryRequest:
    """Delete a supplementary request."""
    return await supplementary_request_service.delete_supplementary_request_for_project(
        db=db,
        project_id=project_id,
        request_id=request_id,
        audit_context=audit_context_kwargs(request),
    )
