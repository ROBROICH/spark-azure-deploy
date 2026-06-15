from uuid import UUID

from audit_client import audit_context_kwargs
from authentification.auth import AuthClient
from authentification.config import auth_settings
from authentification.dependencies import (
    get_auth_client,
    get_current_user,
    list_accessible_resources,
    require_permissions,
    require_role,
)
from authentification.enums import AuthMode, OidcRoles, Permission, Resource
from authentification.models import OidcUserInfo
from authentification.resolver import path_param
from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import RequestValidationError
from src.models.db.database import get_db_session
from src.models.schemas.project_initialization import ProjectInitializationResponse
from src.models.schemas.project_schemas import (
    CreateProjectRequest,
    LatestVersionResponse,
    ProjectInternalStatusEnum,
    ProjectResponse,
    UpdateProjectRequest,
    UpdateProjectStatusRequest,
)
from src.services.projects import project_service

router = APIRouter(prefix="/projects", tags=["Projects"])


class VersionLockValidationRequest(BaseModel):
    source_version: int = Field(..., ge=1)
    target_version: int = Field(..., ge=1)
    lock_token: str = Field(..., min_length=1)


class WriteVersionValidationRequest(BaseModel):
    project_version: int = Field(..., ge=1)


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    name: str | None = Query(None, description="Optional filter string for project name"),
    status: list[ProjectInternalStatusEnum] | None = Query(None, description="Optional filter by project status"),
    db: AsyncSession = Depends(get_db_session),
    assigned_project_ids: list[str] | None = Depends(
        list_accessible_resources(
            resource_type=Resource.PROJECT,
            permission=Permission.READ,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
        )
    ),
):
    """Retrieve a list of all projects, optionally filtered by name.

    Args:
        name: Optional filter string for project name
        status: Optional filter by project status
        db: SQLAlchemy async session dependency
        assigned_project_ids: If provided list of projects ids the result is filtered by
    Returns:
        list[ProjectResponse]: List of matching project records
    """
    if isinstance(assigned_project_ids, list) and len(assigned_project_ids) == 0:
        return []

    return await project_service.list_projects(
        db=db,
        name=name,
        status=status,
        assigned_project_ids=[UUID(_id) for _id in assigned_project_ids] if assigned_project_ids else None,
    )


@router.get(
    "/{project_id}",
    response_model=ProjectResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.READ, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def get_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db_session),
):
    """Retrieve a specific project by its UUID.

    Args:
        project_id: UUID of the project to retrieve
        db: SQLAlchemy async session dependency

    Returns:
        ProjectResponse: The matching project record
    """
    return await project_service.get_project(db=db, project_id=project_id)


@router.post(
    "",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE]))],
)
async def create_project(
    request: Request,
    payload: CreateProjectRequest,
    db: AsyncSession = Depends(get_db_session),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
):
    """Create a new project.

    Args:
        payload: Data used to create the project
        db: SQLAlchemy async session dependency
        user_info: User information extracted from the request
        auth_client: Auth client used to authenticate the request

    Returns:
        ProjectResponse: The newly created project record
    """
    if not payload.created_by_id and user_info:
        payload.created_by_id = UUID(user_info.sub)

    if not payload.created_by_id:
        raise RequestValidationError("Could not get user ID from headers or request body")

    return await project_service.create_project(
        db=db,
        project=payload,
        auth_client=auth_client if auth_settings().mode != AuthMode.DISABLED else None,
        audit_context=audit_context_kwargs(request),
    )


@router.patch(
    "/{project_id}",
    response_model=ProjectResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.UPDATE, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            ),
        ),
    ],
)
async def update_project(
    request: Request,
    project_id: UUID,
    payload: UpdateProjectRequest,
    db: AsyncSession = Depends(get_db_session),
):
    """Update fields of an existing project.

    Args:
        project_id: UUID of the project to update
        payload: Fields to update in the project
        db: SQLAlchemy async session dependency

    Returns:
        ProjectResponse: The updated project record
    """
    updated = await project_service.update_project(
        db=db,
        project_id=project_id,
        data=payload,
        audit_context=audit_context_kwargs(request),
    )
    return await project_service.get_project(db=db, project_id=updated.id)


@router.patch(
    "/{project_id}/status",
    response_model=ProjectResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.UPDATE, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            ),
        )
    ],
)
async def update_project_status(
    request: Request,
    project_id: UUID,
    payload: UpdateProjectStatusRequest,
    db: AsyncSession = Depends(get_db_session),
):
    """Update the status of a project.

    Note: This endpoint does NOT handle project transition side effects
    (e.g., queuing jobs). Those should be handled by the main backend service.

    Args:
        project_id: UUID of the project to update
        payload: Request payload containing the target status name
        db: SQLAlchemy async session dependency

    Returns:
        ProjectResponse: The updated project record
    """
    updated = await project_service.update_project_status(
        db=db,
        project_id=project_id,
        payload=payload,
        audit_context=audit_context_kwargs(request),
    )
    return await project_service.get_project(db=db, project_id=updated.id)


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[
        Depends(
            require_role(allowed_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE]),
        ),
    ],
)
async def delete_project(
    request: Request,
    project_id: UUID,
    db: AsyncSession = Depends(get_db_session),
):
    """Soft-delete a project by setting its is_deleted flag to true via a Temporal workflow."""
    await project_service.start_project_deletion(
        db=db,
        project_id=project_id,
        audit_context=audit_context_kwargs(request),
    )


@router.post(
    "/{project_id}/initialize",
    response_model=ProjectInitializationResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.CREATE, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def start_project_initialization(
    request: Request,
    project_id: UUID = Path(...),
    db: AsyncSession = Depends(get_db_session),
) -> ProjectInitializationResponse:
    """
    Starts project initialization workflow.
    """

    return await project_service.start_project_initialization(
        project_id=project_id,
        db=db,
        audit_context=audit_context_kwargs(request),
    )


@router.get(
    "/{project_id}/latest-version",
    response_model=LatestVersionResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.READ, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def get_latest_version(
    project_id: UUID,
    db: AsyncSession = Depends(get_db_session),
) -> LatestVersionResponse:
    """Get the latest version number for a project."""
    project = await project_service.get_project(db=db, project_id=project_id)
    return LatestVersionResponse(project_id=project_id, latest_version=project.latest_version)


@router.post(
    "/{project_id}/version-lock/validate",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.READ, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def validate_version_lock(
    project_id: UUID,
    payload: VersionLockValidationRequest,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    try:
        await project_service.validate_project_version_lock(
            db=db,
            project_id=project_id,
            source_version=payload.source_version,
            target_version=payload.target_version,
            lock_token=payload.lock_token,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post(
    "/{project_id}/version-lock/validate-write",
    response_model=LatestVersionResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.READ, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def validate_write_version(
    project_id: UUID,
    payload: WriteVersionValidationRequest,
    db: AsyncSession = Depends(get_db_session),
) -> LatestVersionResponse:
    latest = await project_service.ensure_project_write_version(
        db=db,
        project_id=project_id,
        project_version=payload.project_version,
    )
    return LatestVersionResponse(project_id=project_id, latest_version=latest)
