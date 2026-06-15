from uuid import UUID

from audit_client import audit_context_kwargs
from authentification.dependencies import require_permissions
from authentification.enums import OidcRoles, Permission, Resource
from authentification.resolver import path_param
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db.database import get_db_session
from src.models.db.enums import ProcessStep, SourceType
from src.models.schemas.comment_schemas import (
    CommentResponse,
    CreateCommentRequest,
    UpdateCommentRequest,
)
from src.services import comment_service

router = APIRouter(prefix="/projects", tags=["Comments"])


@router.get(
    "/{project_id}/comments",
    response_model=list[CommentResponse],
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.READ, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def get_comments(
    project_id: UUID,
    process_step: list[ProcessStep] | None = Query(None),
    source_type: list[SourceType] | None = Query(None),
    limit: int | None = Query(None, ge=1, le=100),
    offset: int | None = Query(None, ge=0),
    db: AsyncSession = Depends(get_db_session),
) -> list[CommentResponse]:
    return await comment_service.get_comments(project_id, db, process_step, source_type, limit, offset)


@router.post(
    "/{project_id}/comments",
    response_model=CommentResponse,
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
async def create_comment(
    project_id: UUID,
    payload: CreateCommentRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> CommentResponse:
    return await comment_service.create_comment(project_id, payload, db, audit_context=audit_context_kwargs(request))


@router.patch(
    "/{project_id}/comments/{comment_id}",
    response_model=CommentResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.UPDATE, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def update_comment(
    project_id: UUID,
    comment_id: UUID,
    payload: UpdateCommentRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> CommentResponse:
    return await comment_service.update_comment(
        project_id, comment_id, payload, db, audit_context=audit_context_kwargs(request)
    )


@router.delete(
    "/{project_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.DELETE, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def delete_comment(
    project_id: UUID,
    comment_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    await comment_service.delete_comment(project_id, comment_id, db, audit_context=audit_context_kwargs(request))
