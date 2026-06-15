from typing import Annotated

from authentification.auth import AuthClient, RelationshipItem
from authentification.dependencies import get_auth_client, get_current_user, require_permissions
from authentification.enums import OidcRoles, Permission, Relation, Resource, Subject
from authentification.models import OidcUserInfo
from authentification.resolver import path_param
from event_logging import EventAction, EventCategory, EventOutcome
from fastapi import APIRouter, Depends, HTTPException, status

from src.models.schemas.assignment import ProjectAssignmentsRequest, RelationshipWriteResponse
from src.utils.logger import logger

router = APIRouter(prefix="/assign", tags=["assignment"])


@router.post(
    "/projects/{project_id}/assignments",
    response_model=RelationshipWriteResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.ASSIGN, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            ),
        ),
    ],
)
async def replace_project_assignments(
    project_id: str,
    payload: ProjectAssignmentsRequest,
    auth_client: Annotated[AuthClient, Depends(get_auth_client)],
    user_info: Annotated[OidcUserInfo | None, Depends(get_current_user)],
) -> RelationshipWriteResponse:
    """Replace owner/member assignments for a project."""
    requested_assignments = {(assignment.role, assignment.user_id) for assignment in payload.assignments}
    if not any(relation == Relation.OWNER for relation, _ in requested_assignments):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one project owner is required.",
        )

    current_relations = await auth_client.list_resource_relations_bulk(
        resource_type=Resource.PROJECT,
        resource_ids=[project_id],
        relations=[Relation.OWNER, Relation.MEMBER],
        subject_type=Subject.USER,
    )

    project_relations = current_relations.get(project_id, {})
    current_assignments: set[tuple[Relation, str]] = {
        (relation, user_id)
        for relation in (Relation.OWNER, Relation.MEMBER)
        for user_id in project_relations.get(relation.value, [])
    }

    touch_items = [
        RelationshipItem(
            resource_type=Resource.PROJECT,
            resource_id=project_id,
            relation=relation,
            subject_type=Subject.USER,
            subject_id=user_id,
        )
        for relation, user_id in sorted(requested_assignments)
    ]
    added_items = [
        RelationshipItem(
            resource_type=Resource.PROJECT,
            resource_id=project_id,
            relation=relation,
            subject_type=Subject.USER,
            subject_id=user_id,
        )
        for relation, user_id in sorted(requested_assignments - current_assignments)
    ]
    delete_items = [
        RelationshipItem(
            resource_type=Resource.PROJECT,
            resource_id=project_id,
            relation=relation,
            subject_type=Subject.USER,
            subject_id=user_id,
        )
        for relation, user_id in sorted(current_assignments - requested_assignments)
    ]

    await auth_client.bulk_update_relationships(
        touch_items=touch_items,
        delete_items=delete_items,
    )

    logger.info(
        action=EventAction.NOTIFY,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.SECURITY,
        message=(
            f"User {user_info.sub if user_info else 'UNKNOWN'} updated project assignments. "
            f"Added: {added_items}. Deleted: {delete_items}."
        ),
    )

    return RelationshipWriteResponse()
