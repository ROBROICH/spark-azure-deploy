"""API routes for plausibility note management."""

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
from authentification.resolver import path_param
from authentification.verifier import OidcVerifier
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db.database import get_db_session
from src.models.schemas.plausibility_notes import (
    JobDoneRequest,
    JobDoneResponse,
    PlausibilityCheckResult,
    SuccessResponse,
    UpdateNoteRequest,
)
from src.services.plausibility_notes_service import (
    delete_note,
    get_note,
    get_plausibility_notes,
    process_job_results,
    update_note_status,
)

router = APIRouter(prefix="/plausibility-notes", tags=["Plausibility Notes"])
AUTHENTICATED_ROLES = [OidcRoles.SERVICE, OidcRoles.USER, OidcRoles.ADMIN]


@router.get(
    "/{project_id}",
    response_model=PlausibilityCheckResult,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.READ, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def get_notes(
    project_id: UUID,
    db: AsyncSession = Depends(get_db_session),
) -> PlausibilityCheckResult:
    """Return all plausibility notes for the specified project."""
    return await get_plausibility_notes(project_id, db)


@router.post(
    "/{project_id}/job-done",
    response_model=JobDoneResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.SERVICE]))],
)
async def job_done(
    project_id: UUID,
    payload: JobDoneRequest,
    project_version: int | None = Query(None, ge=1),
    db: AsyncSession = Depends(get_db_session),
) -> JobDoneResponse:
    """Process completed plausibility check job results.

    Fetches the results JSON from Document Management Service using the provided
    file_id, clears existing data for the project, and stores the new results.
    """
    return await process_job_results(project_id, payload.file_id, db, project_version=project_version)


@router.patch(
    "/notes/{note_id}",
    response_model=SuccessResponse,
    dependencies=[Depends(require_role(allowed_roles=AUTHENTICATED_ROLES))],
)
async def update_note(
    note_id: UUID,
    payload: UpdateNoteRequest,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
    verifier: OidcVerifier = Depends(get_verifier),
) -> SuccessResponse:
    """Update the status of a plausibility note."""
    if user_info:
        note = await get_note(
            db=db,
            note_id=note_id,
        )
        await check_permission(
            user=user_info,
            resource_type=Resource.PROJECT,
            resource_id=str(note.project_id),
            permission=Permission.UPDATE,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            auth_client=auth_client,
            response=response,
            dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        )

    note = await update_note_status(note_id, payload.status, db)
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    return SuccessResponse()


@router.delete(
    "/notes/{note_id}",
    response_model=SuccessResponse,
    dependencies=[Depends(require_role(allowed_roles=AUTHENTICATED_ROLES))],
)
async def delete_single_note(
    note_id: UUID,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
    verifier: OidcVerifier = Depends(get_verifier),
) -> SuccessResponse:
    """Delete a plausibility note by ID."""
    if user_info:
        note = await get_note(
            db=db,
            note_id=note_id,
        )
        await check_permission(
            user=user_info,
            resource_type=Resource.PROJECT,
            resource_id=str(note.project_id),
            permission=Permission.DELETE,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            auth_client=auth_client,
            response=response,
            dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        )
    deleted = await delete_note(note_id, db)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    return SuccessResponse()
