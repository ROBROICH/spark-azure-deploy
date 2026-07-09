from typing import Annotated
from uuid import UUID

from authentification.auth import AuthClient, BulkCheckItem
from authentification.auth_utils import check_permission, check_permissions
from authentification.dependencies import (
    get_auth_client,
    get_current_user,
    get_verifier,
    list_accessible_resources,
    require_permission_from_body,
    require_role,
)
from authentification.enums import AuthMode, OidcRoles, Permission, Resource
from authentification.models import OidcUserInfo
from authentification.verifier import OidcVerifier
from fastapi import APIRouter, Body, Depends, Query, Response, status

from src.api.dependecies import get_topic_service
from src.models.schemas.topic_schemas import (
    CreateTopicRequest,
    TopicNormResponse,
    TopicResponse,
    UpdateTopicRequest,
)
from src.services.topics.topic_service import TopicService

router = APIRouter(prefix="/topics", tags=["Topics"])
AUTHENTICATED_ROLES = [OidcRoles.SERVICE, OidcRoles.USER, OidcRoles.ADMIN]


@router.get("", response_model=list[TopicResponse])
async def list_topics(
    project_id: UUID | None = Query(
        None,
        description="Only topics belonging to this project",
        alias="projectId",
    ),
    include_deleted: bool = Query(False, alias="includeDeleted"),
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 50,
    service: TopicService = Depends(get_topic_service),
    assigned_project_ids: list[str] | None = Depends(
        list_accessible_resources(
            resource_type=Resource.PROJECT,
            permission=Permission.READ,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
        )
    ),
):
    """List topics, optionally filtered by project.

    Args:
        include_deleted: Whether to include deleted topics
        page: Page number
        page_size: Page size
        project_id: Optional project ID to filter by
        service: Service to handle topics
        assigned_project_ids: Project IDs the user has READ access to (from auth)

    Returns:
        list[TopicResponse]: Topics ordered by end date
    """
    if isinstance(assigned_project_ids, list) and len(assigned_project_ids) == 0:
        return []

    return await service.list_topics(
        project_id=project_id,
        include_deleted=include_deleted,
        page=page,
        page_size=page_size,
        assigned_project_ids=[UUID(_id) for _id in assigned_project_ids] if assigned_project_ids else None,
    )


@router.post(
    "",
    response_model=TopicResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_topic(
    payload: CreateTopicRequest = Depends(
        require_permission_from_body(
            CreateTopicRequest,
            "project_id",
            Permission.CREATE,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
        )
    ),
    service: TopicService = Depends(get_topic_service),
):
    """Create a new topic.

    Args:
        payload: Topic data including project ID
        service: Service to handle topics

    Returns:
        TopicResponse: The created topic
    """
    return await service.create_topic(data=payload)


@router.patch(
    "/{topic_id}",
    response_model=TopicResponse,
    dependencies=[Depends(require_role(allowed_roles=AUTHENTICATED_ROLES))],
)
async def update_topic(
    topic_id: UUID,
    payload: UpdateTopicRequest,
    response: Response,
    service: TopicService = Depends(get_topic_service),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
    verifier: OidcVerifier = Depends(get_verifier),
):
    """Update an existing topic.

    Args:
        topic_id: UUID of the topic to update
        payload: Updated topic data
        service: Service to handle topics

    Returns:
        TopicResponse: The updated topic
    """
    if user_info:
        topic = await service.get_topic(
            topic_id=topic_id,
        )
        await check_permission(
            user=user_info,
            resource_type=Resource.PROJECT,
            resource_id=str(topic.project_id),
            permission=Permission.UPDATE,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            auth_client=auth_client,
            response=response,
            dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        )
    return await service.update_topic(
        topic_id=topic_id,
        data=payload,
    )


@router.delete(
    "/{topic_id}",
    response_model=TopicResponse,
    dependencies=[Depends(require_role(allowed_roles=AUTHENTICATED_ROLES))],
)
async def delete_topic(
    topic_id: UUID,
    response: Response,
    service: TopicService = Depends(get_topic_service),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
    verifier: OidcVerifier = Depends(get_verifier),
):
    """Delete a topic.

    Args:
        topic_id: UUID of the topic to delete
        service: Service to handle topics

    Returns:
        TopicResponse: The deleted topic
    """
    if user_info:
        topic = await service.get_topic(
            topic_id=topic_id,
        )
        await check_permission(
            user=user_info,
            resource_type=Resource.PROJECT,
            resource_id=str(topic.project_id),
            permission=Permission.DELETE,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            auth_client=auth_client,
            response=response,
            dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        )
    return await service.delete_topic(topic_id=topic_id)


@router.get(
    "/{topic_id}",
    response_model=TopicResponse,
    dependencies=[Depends(require_role(allowed_roles=AUTHENTICATED_ROLES))],
)
async def get_topic(
    topic_id: UUID,
    response: Response,
    include_deleted: bool = Query(False, description="Include soft-deleted topics", alias="includeDeleted"),
    service: TopicService = Depends(get_topic_service),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
    verifier: OidcVerifier = Depends(get_verifier),
):
    """Retrieve a single topic by ID.

    Args:
        topic_id: UUID of the topic to retrieve
        include_deleted: Include soft-deleted topics
        service: Service to handle topics

    Returns:
        TopicResponse: The requested topic
    """
    topic = await service.get_topic(
        topic_id=topic_id,
        include_deleted=include_deleted,
    )
    if user_info:
        await check_permission(
            user=user_info,
            resource_type=Resource.PROJECT,
            resource_id=str(topic.project_id),
            permission=Permission.READ,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            auth_client=auth_client,
            response=response,
            dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        )
    return topic


@router.post(
    "/batch",
    response_model=list[TopicResponse],
    summary="Bulk get topics by IDs",
    description=(
        "Fetch multiple topics by their IDs in one request.\n"
        "Returns only existing topics (missing IDs are silently ignored).\n"
        "Use ?raise_on_missing=true to get 404 when any ID is missing."
    ),
    dependencies=[Depends(require_role(allowed_roles=AUTHENTICATED_ROLES))],
)
async def get_topics_batch(
    response: Response,
    ids: list[UUID] = Body(
        ...,
        description="Array of topic UUIDs to fetch",
        examples=[
            "550e8400-e29b-41d4-a716-446655440000",
            "123e4567-e89b-12d3-a456-426614174000",
        ],
    ),
    include_deleted: bool = Query(
        False,
        description="Include soft-deleted topics",
        alias="includeDeleted",
    ),
    raise_on_missing: bool = Query(
        False,
        description="If true → 404 if any requested ID does not exist",
        alias="raiseOnMissing",
    ),
    service: TopicService = Depends(get_topic_service),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
    verifier: OidcVerifier = Depends(get_verifier),
):
    """
    Get all topics currently assigned to a project.

    Note: If raiseOnMissing is False, the list of returned topics could be less than
        the input ids

    Args:
        ids: List of topic IDs to get topics for
        include_deleted: Whether to include deleted topics
        service: Service to handle topics
        raise_on_missing: Whether to raise 404 when any ID is missing
    Returns:
        list[TopicResponse]: Topics ordered as the input list
    """
    topics = await service.get_topics(
        topic_ids=ids,
        include_deleted=include_deleted,
        raise_on_missing=raise_on_missing,
    )
    if user_info:
        await check_permissions(
            user=user_info,
            auth_client=auth_client,
            checks=[
                BulkCheckItem(
                    resource_type=Resource.PROJECT,
                    resource_id=str(topic.project_id),
                    permission=Permission.READ,
                )
                for topic in topics
            ],
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            response=response,
            dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        )
    return topics


@router.get(
    "/{topic_id}/norms",
    response_model=list[TopicNormResponse],
    dependencies=[Depends(require_role(allowed_roles=AUTHENTICATED_ROLES))],
)
async def get_topic_norms(
    topic_id: UUID,
    response: Response,
    include_deleted: bool = Query(False, description="Include soft-deleted topics", alias="includeDeleted"),
    service: TopicService = Depends(get_topic_service),
    user_info: OidcUserInfo | None = Depends(get_current_user),
    auth_client: AuthClient = Depends(get_auth_client),
    verifier: OidcVerifier = Depends(get_verifier),
):
    """Retrieve norms for a specific topic.

    Args:
        topic_id: UUID of the topic to retrieve norms for
        include_deleted: Include soft-deleted topics
        service: Service to handle topics

    Returns:
        list[UUID: The norms associated with the topic
    """
    if user_info:
        topic = await service.get_topic(
            topic_id=topic_id,
            include_deleted=include_deleted,
        )
        await check_permission(
            user=user_info,
            resource_type=Resource.PROJECT,
            resource_id=str(topic.project_id),
            permission=Permission.READ,
            bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            auth_client=auth_client,
            response=response,
            dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        )
    return await service.get_norms_from_topic(
        topic_id=topic_id,
        include_deleted=include_deleted,
    )
