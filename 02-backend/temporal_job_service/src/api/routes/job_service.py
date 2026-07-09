from uuid import UUID

import temporalio
from authentification.auth import AuthClient, BulkCheckItem
from authentification.auth_utils import check_permissions
from authentification.dependencies import (
    get_auth_client,
    get_current_user,
    get_verifier,
    require_permissions,
    require_role,
)
from authentification.enums import AuthMode, OidcRoles, Permission, Resource, Subject
from authentification.models import OidcUserInfo
from authentification.resolver import path_param, query_param
from authentification.verifier import OidcVerifier
from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)
from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from temporalio.client import Client

from src.models.schemas.job_service_schemas import (
    ExecutionStatus,
    GetSystemLoadResponse,
    GetWorkflowExecutionTreeResponse,
    GetWorkflowResponse,
    GetWorkflowsByTypeResponse,
    GetWorkflowsResponse,
    WorkflowsByTypeQuery,
)
from src.services.job_service_service import JobServiceService
from src.temporal.client import get_temporal_client
from src.utils.logger import logger

router = APIRouter(prefix="/temporal", tags=["Temporal"])
service = JobServiceService()
WORKFLOW_DETAIL_BYPASS_ROLES = [OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE]


def has_workflow_detail_bypass_role(user: OidcUserInfo) -> bool:
    return bool(set(user.realm_roles) & set(WORKFLOW_DETAIL_BYPASS_ROLES))


async def require_workflow_project_read(
    response: Response,
    workflow_id: str = Path(..., description="The workflow id that you want to retrieve"),
    user: OidcUserInfo | None = Depends(get_current_user),
    verifier: OidcVerifier = Depends(get_verifier),
    auth_client: AuthClient = Depends(get_auth_client),
    temporal_client: Client = Depends(get_temporal_client),
) -> OidcUserInfo | None:
    if verifier.requires_user and user is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authentication required",
        )

    if user is None:
        return None

    if has_workflow_detail_bypass_role(user):
        return user

    try:
        project_id = await service.get_workflow_project_id(
            workflow_id=workflow_id,
            temporal_client=temporal_client,
        )
    except temporalio.service.RPCError as exc:
        if "workflow not found for id" in str(exc).lower():
            raise HTTPException(status_code=404, detail=f"Workflow does not exist: {workflow_id}") from exc
        raise

    if project_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workflow project context does not exist: {workflow_id}",
        )

    await check_permissions(
        user=user,
        checks=[
            BulkCheckItem(
                resource_type=Resource.PROJECT,
                resource_id=project_id,
                permission=Permission.READ,
            )
        ],
        auth_client=auth_client,
        subject=Subject.USER,
        bypass_roles=WORKFLOW_DETAIL_BYPASS_ROLES,
        dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        response=response,
    )

    return user


@router.get(
    "/workflows",
    response_model=GetWorkflowsResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.READ, query_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def get_workflows(
    execution_status: ExecutionStatus = Query(ExecutionStatus.ALL, description="Which type of workflow to show"),
    project_id: UUID = Query(..., description="The 'Verfahren' to filter on"),
    project_version: int | None = Query(None, ge=1, description="Project version to filter on"),
    temporal_client: Client = Depends(get_temporal_client),
) -> GetWorkflowsResponse:
    """
    Retrieve a paginated list of Temporal jobs (workflows) with optional filtering.

    This method queries the Temporal server for workflows matching the given filters and returns
    information about the workflows, including the latest workflow IDs,
    and detailed execution info for each matched workflow.
    """
    try:
        return await service.get_workflows(
            execution_status=execution_status,
            project_id=project_id,
            project_version=project_version,
            temporal_client=temporal_client,
        )
    except Exception as e:
        logger.warn(
            action=EventAction.ACCESS,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            default_event=LogEventDefault.API_RESPONSE,
            message=f"Error retrieving workflows: {e!s}",
        )
        raise HTTPException(status_code=500, detail="An error occurred during workflow retrieval") from e


@router.get(
    "/workflows/{project_id}/by-type",
    response_model=GetWorkflowsByTypeResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.READ, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def get_workflows_by_type(
    project_id: UUID = Path(..., description="The 'Verfahren' to filter on"),
    params: WorkflowsByTypeQuery = Depends(),
    temporal_client: Client = Depends(get_temporal_client),
) -> GetWorkflowsByTypeResponse:
    """Retrieve project workflows filtered by a single workflow type."""
    try:
        return await service.get_workflows_by_type(
            project_id=project_id,
            workflow_type=params.workflow_type,
            include_children=params.include_children,
            project_version=params.project_version,
            temporal_client=temporal_client,
        )
    except Exception as e:
        logger.warn(
            action=EventAction.ACCESS,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            default_event=LogEventDefault.API_RESPONSE,
            message=f"Error retrieving workflows by type: {e!s}",
        )
        raise HTTPException(
            status_code=500,
            detail="An error occurred during workflow retrieval",
        ) from e


@router.get(
    "/workflows/{workflow_id}",
    response_model=GetWorkflowResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[
        Depends(require_role(allowed_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE])),
        Depends(require_workflow_project_read),
    ],
)
async def get_workflow(
    workflow_id: str = Path(..., description="The workflow id that you want to retrieve"),
    temporal_client: Client = Depends(get_temporal_client),
) -> GetWorkflowResponse:
    """Gets the status of a given workflow using its id. If the result is ready at the time of executing this route returns the result as well.<br />"""
    try:
        return await service.get_workflow(workflow_id=workflow_id, temporal_client=temporal_client)
    except temporalio.service.RPCError as exc:
        if "workflow not found for id" in str(exc).lower():
            logger.warn(
                action=EventAction.ACCESS,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.API,
                default_event=LogEventDefault.API_RESPONSE,
                message=f"workflow id does not exist: {workflow_id}",
            )
            raise HTTPException(status_code=404, detail=f"Workflow does not exist: {workflow_id}") from exc
        logger.warn(
            action=EventAction.ACCESS,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            default_event=LogEventDefault.API_RESPONSE,
            message=f"Error retrieving workflow: {exc!s}",
        )
        raise HTTPException(status_code=500, detail="An error occurred during workflow retrieval") from exc
    except Exception as e:
        logger.warn(
            action=EventAction.ACCESS,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            default_event=LogEventDefault.API_RESPONSE,
            message=f"Error retrieving workflow: {e!s}",
        )
        raise HTTPException(status_code=500, detail="An error occurred during workflow retrieval") from e


@router.get(
    "/workflows/{workflow_id}/execution-tree",
    response_model=GetWorkflowExecutionTreeResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[
        Depends(require_role(allowed_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE])),
        Depends(require_workflow_project_read),
    ],
)
async def get_workflow_execution_tree(
    workflow_id: str = Path(..., description="The workflow id that you want to retrieve"),
    temporal_client: Client = Depends(get_temporal_client),
) -> GetWorkflowExecutionTreeResponse:
    """Gets the lineage of a given workflow using its id."""
    try:
        return await service.get_workflow_execution_tree(workflow_id=workflow_id, temporal_client=temporal_client)
    except Exception as e:
        logger.warn(
            action=EventAction.ACCESS,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            default_event=LogEventDefault.API_RESPONSE,
            message=f"Error retrieving workflow execution tree: {e!s}",
        )
        raise HTTPException(
            status_code=500,
            detail="An error occurred during workflow execution tree retrieval",
        ) from e


@router.get(
    "/load",
    response_model=GetSystemLoadResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE]))],
)
async def get_system_load(
    temporal_client: Client = Depends(get_temporal_client),
) -> GetSystemLoadResponse:
    """Return the current system load based on running workflows and their complexity weights."""
    return await service.get_system_load(temporal_client=temporal_client)
