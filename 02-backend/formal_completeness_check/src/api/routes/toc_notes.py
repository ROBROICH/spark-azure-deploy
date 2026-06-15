from uuid import UUID

from audit_client import audit_context_kwargs
from authentification.dependencies import require_permissions, require_role
from authentification.enums import OidcRoles, Permission, Resource
from authentification.resolver import path_param
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db.database import get_db_session
from src.models.schemas.toc_schemas import (
    CreateTableContentNoteRequest,
    TableContentNotesResponse,
    TocJobDoneRequest,
    TocJobDoneResponse,
    TocNotesWithStatusResponse,
    UpdateResolvedRequest,
)
from src.services.toc_service import (
    create_toc_notes,
    get_toc_notes_for_project,
    process_toc_job_results,
    update_toc_note_resolved_status,
)

router = APIRouter(prefix="/{project_id}/toc-notes", tags=["TOC Notes"])


@router.get(
    "",
    response_model=TocNotesWithStatusResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.READ, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def get_project_toc_notes(
    project_id: UUID,
    db: AsyncSession = Depends(get_db_session),
) -> TocNotesWithStatusResponse:
    """Return all table of content notes and TOC job status for the specified project."""
    return await get_toc_notes_for_project(project_id, db)


@router.post(
    "",
    response_model=list[TableContentNotesResponse],
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
async def create_project_toc_notes(
    project_id: UUID,
    payload: list[CreateTableContentNoteRequest],
    db: AsyncSession = Depends(get_db_session),
) -> list[TableContentNotesResponse]:
    """Create table of content notes for the specified project."""
    return await create_toc_notes(project_id, payload, db)


@router.post(
    "/results",
    response_model=TocJobDoneResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.SERVICE]))],
)
async def toc_job_done(
    project_id: UUID,
    payload: TocJobDoneRequest,
    project_version: int | None = Query(None, ge=1),
    db: AsyncSession = Depends(get_db_session),
) -> TocJobDoneResponse:
    """Process completed toc notes job results."""
    return await process_toc_job_results(project_id, payload.file_id, db, project_version=project_version)


@router.patch(
    "/{note_id}",
    response_model=TableContentNotesResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.UPDATE, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def update_project_toc_note_resolved(
    project_id: UUID,
    note_id: UUID,
    payload: UpdateResolvedRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> TableContentNotesResponse:
    """Update the resolved status of a table of content note for the specified project."""
    return await update_toc_note_resolved_status(
        project_id, note_id, payload.is_resolved, db, audit_context=audit_context_kwargs(request)
    )
