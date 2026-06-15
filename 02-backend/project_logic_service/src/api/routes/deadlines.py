from uuid import UUID

from audit_client import audit_context_kwargs
from authentification.auth import AuthClient
from authentification.auth_utils import check_permission
from authentification.dependencies import (
    get_auth_client,
    get_current_user,
    get_verifier,
    list_accessible_resources,
    require_permissions,
    require_role,
)
from authentification.enums import AuthMode, OidcRoles, Permission, Resource
from authentification.models import OidcUserInfo
from authentification.resolver import body_field
from authentification.verifier import OidcVerifier
from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db.database import get_db_session
from src.models.schemas.deadline_schemas import (
    CreateDeadlineRequest,
    DeadlineResponse,
    UpdateDeadlineRequest,
)
from src.services.deadlines import deadline_service

router = APIRouter(prefix="/deadlines", tags=["Deadlines"])
AUTHENTICATED_ROLES = [OidcRoles.SERVICE, OidcRoles.USER, OidcRoles.ADMIN]


@router.get("", response_model=list[DeadlineResponse])
async def list_deadlines(
    project_id: UUID | None = Query(None, description="Optional project ID to filter deadlines by"),
    db: AsyncSession = Depends(get_db_session),
    assigned_project_ids: list[str] | None = Depends(
        list_accessible_resources(
            resource_type=Resource.PROJECT,
            permission=Permission.READ,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
        )
    ),
):
    """List deadlines, optionally filtered by project.

    Args:
        project_id: Optional project ID to filter by
        db: SQLAlchemy async database session
        assigned_project_ids: Project IDs the user has READ access to (from auth)

    Returns:
        list[DeadlineResponse]: Deadlines ordered by end date
    """
    if isinstance(assigned_project_ids, list) and len(assigned_project_ids) == 0:
        result: list[DeadlineResponse] = []
        return result

    return await deadline_service.list_deadlines(
        db=db,
        project_id=project_id,
        assigned_project_ids=[UUID(_id) for _id in assigned_project_ids] if assigned_project_ids else None,
    )


@router.post(
    "",
    response_model=DeadlineResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.CREATE, body_field("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def create_deadline(
    request: Request,
    payload: CreateDeadlineRequest,
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new deadline for a project.

    Args:
        payload: Deadline data including project ID
        db: SQLAlchemy async database session

    Returns:
        DeadlineResponse: The created deadline
    """
    return await deadline_service.create_deadline(
        db=db,
        deadline_data=payload,
        audit_context=audit_context_kwargs(request),
    )


@router.patch(
    "/{deadline_id}",
    response_model=DeadlineResponse,
    dependencies=[Depends(require_role(allowed_roles=AUTHENTICATED_ROLES))],
)
async def update_deadline(
    request: Request,
    deadline_id: UUID,
    payload: UpdateDeadlineRequest,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
    verifier: OidcVerifier = Depends(get_verifier),
):
    """Update an existing deadline.

    Args:
        deadline_id: UUID of the deadline to update
        payload: Updated deadline data
        db: SQLAlchemy async database session

    Returns:
        DeadlineResponse: The updated deadline
    """
    if user_info:
        deadline = await deadline_service.get_deadline(
            db=db,
            deadline_id=deadline_id,
        )
        await check_permission(
            user=user_info,
            resource_type=Resource.PROJECT,
            resource_id=str(deadline.project_id),
            permission=Permission.UPDATE,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            auth_client=auth_client,
            response=response,
            dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        )

    return await deadline_service.update_deadline(
        db=db,
        deadline_id=deadline_id,
        deadline_data=payload,
        audit_context=audit_context_kwargs(request),
    )


@router.delete(
    "/{deadline_id}",
    response_model=DeadlineResponse,
    dependencies=[Depends(require_role(allowed_roles=AUTHENTICATED_ROLES))],
)
async def delete_deadline(
    request: Request,
    deadline_id: UUID,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
    verifier: OidcVerifier = Depends(get_verifier),
):
    """Delete a deadline.

    Args:
        deadline_id: UUID of the deadline to delete
        db: SQLAlchemy async database session

    Returns:
        DeadlineResponse: The deleted deadline
    """
    if user_info:
        deadline = await deadline_service.get_deadline(
            db=db,
            deadline_id=deadline_id,
        )
        await check_permission(
            user=user_info,
            resource_type=Resource.PROJECT,
            resource_id=str(deadline.project_id),
            permission=Permission.DELETE,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            auth_client=auth_client,
            response=response,
            dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        )
    return await deadline_service.delete_deadline(
        db=db,
        deadline_id=deadline_id,
        audit_context=audit_context_kwargs(request),
    )


@router.get(
    "/{deadline_id}",
    response_model=DeadlineResponse,
    dependencies=[Depends(require_role(allowed_roles=AUTHENTICATED_ROLES))],
)
async def get_deadline(
    deadline_id: UUID,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
    verifier: OidcVerifier = Depends(get_verifier),
):
    """Retrieve a single deadline by ID.

    Args:
        deadline_id: UUID of the deadline to retrieve
        db: SQLAlchemy async database session

    Returns:
        DeadlineResponse: The requested deadline
    """
    deadline = await deadline_service.get_deadline(
        db=db,
        deadline_id=deadline_id,
    )
    if user_info:
        await check_permission(
            user=user_info,
            resource_type=Resource.PROJECT,
            resource_id=str(deadline.project_id),
            permission=Permission.READ,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            auth_client=auth_client,
            response=response,
            dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        )
    return deadline
