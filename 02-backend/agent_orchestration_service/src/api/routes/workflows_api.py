from typing import Annotated
from uuid import UUID

import puremagic
from authentification.dependencies import require_permission_from_body, require_role
from authentification.enums import OidcRoles, Permission
from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from temporal import get_temporal_client, project_scoped_workflow_id, stop_workflow, use_project_context
from temporal.utils import start_workflow
from temporal.workflows.anonymisierung.anonymisierung import (
    execute_anonymisierung_workflow,
)
from temporalio.common import Priority, WorkflowIDConflictPolicy, WorkflowIDReusePolicy
from temporalio.exceptions import WorkflowAlreadyStartedError

from src.config.settings import settings
from src.models.schemas.temporal.diplan import (
    DiPlanWorkflowArgs,
    DiPlanWorkflowRequest,
)
from src.models.schemas.temporal.fpp import FPPDownloadWorkflowArgs
from src.models.schemas.temporal.fvp import (
    FVPWorkflowArgs,
    FVPWorkflowRequest,
)
from src.models.schemas.workflows import (
    BatchMVPRequest,
    BewertungRequest,
    CancelWorkflowResponse,
    RisikohinweiseRequest,
    SucheZuordnungNormRequest,
    WorkflowResponse,
)
from src.services.api_clients import PlsApiClient
from src.services.workflows.diplan import start_diplan_workflow
from src.services.workflows.fpp_download import start_fpp_download
from src.services.workflows.fvp import start_fvp_workflow
from src.utils.logger import logger
from src.workflows.batch_mvp.types import BatchMVPWorkflowInput
from src.workflows.batch_mvp.workflow import BATCH_MVP_WORKFLOW_ID
from src.workflows.bewertung.types import BEWERTUNG_WORKFLOW_ID, BewertungInput
from src.workflows.risikohinweise.types import RISIKOHINWEISE_WORKFLOW_ID, RisikohinweiseWorkflowInput
from src.workflows.suche_zuordnung_norm.types import (
    SUCHE_ZUORDNUNG_NORM_WORKFLOW_ID,
    TASK_QUEUE,
    SucheZuordnungNormWorkflowInput,
)

router = APIRouter(prefix="/workflows", tags=["Workflows"])


async def _latest_project_version(project_id: str | UUID) -> int:
    return await PlsApiClient.get_latest_project_version(project_id)


EMPTY_PDF_BYTES = (
    b"%PDF-1.4\n"
    b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
    b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1 1] >>\nendobj\n"
    b"xref\n"
    b"0 4\n"
    b"0000000000 65535 f \n"
    b"0000000009 00000 n \n"
    b"0000000058 00000 n \n"
    b"0000000115 00000 n \n"
    b"trailer\n<< /Root 1 0 R /Size 4 >>\n"
    b"startxref\n"
    b"182\n"
    b"%%EOF\n"
)


@router.post(
    "/diplan",
    response_model=WorkflowResponse,
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.SERVICE]))],
)
async def orchestrate_workflow(payload: DiPlanWorkflowRequest) -> WorkflowResponse:
    """
    Orchestrate a DiPlan workflow.

    Args:
        payload (DiPlanWorkflowRequest): The payload containing the DiPlan workflow request.

    Returns:
        WorkflowResponse: The response containing the parent workflow ID, child workflow IDs and types.
    """

    project_version = await _latest_project_version(payload.request_id)
    with use_project_context(payload.request_id, project_version):
        handle = await start_diplan_workflow(
            DiPlanWorkflowArgs(
                project_id=payload.request_id,
                files=payload.files,
                folder_information=payload.folder_information,
            ),
            project_id=payload.request_id,
        )
    return WorkflowResponse(parent_job_id=handle.id)


@router.post(
    "/anonymisierung",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE]))],
)
async def anonymize_pdf(
    request_id: UUID = Form(..., alias="requestId"),
    file: UploadFile | None = File(None),
) -> Response:
    """
    Anonymize a PDF uploaded directly by the frontend.

    The frontend-generated request ID is used as the Temporal idempotency key so
    retries attach to the same workflow execution.
    """
    pdf_data = EMPTY_PDF_BYTES if file is None else await file.read()
    if not pdf_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded PDF is empty.",
        )
    try:
        detected_mime_type = puremagic.from_string(string=pdf_data, mime=True)
        if detected_mime_type != "application/pdf":
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Only PDF uploads are supported.",
            )
    except (puremagic.PureError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF uploads are supported.",
        ) from exc

    redacted_pdf = await execute_anonymisierung_workflow(
        pdf_data,
        request_id,
    )
    return Response(
        content=redacted_pdf,
        media_type="application/pdf",
    )


@router.post(
    "/fpp-download",
    response_model=WorkflowResponse,
)
async def orchestrate_fpp_download_workflow(
    payload: Annotated[
        FPPDownloadWorkflowArgs,
        Depends(
            require_permission_from_body(
                FPPDownloadWorkflowArgs,
                "project_id",
                Permission.EXECUTE,
                bypass_roles=[OidcRoles.SERVICE],
            )
        ),
    ],
) -> WorkflowResponse:
    """
    Orchestrate an FPP file download workflow.

    Args:
        payload (FPPDownloadWorkflowArgs): The payload containing project ID and file information.

    Returns:
        WorkflowResponse: The response containing the workflow ID.
    """
    project_version = await _latest_project_version(payload.project_id)
    with use_project_context(payload.project_id, project_version):
        handle = await start_fpp_download(
            project_id=payload.project_id,
            file=payload.file.model_dump(),
        )
    return WorkflowResponse(parent_job_id=handle.id)


@router.post(
    "/formale-pruefung",
    response_model=WorkflowResponse,
)
async def orchestrate_fvp_workflow(
    payload: Annotated[
        FVPWorkflowRequest,
        Depends(
            require_permission_from_body(
                FVPWorkflowRequest,
                "project_id",
                Permission.EXECUTE,
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
) -> WorkflowResponse:
    """
    Orchestrate a FVP (Formale Vollständigkeitsprüfung) workflow.

    Args:
        payload (FVPWorkflowRequest): The payload containing the project ID.

    Returns:
        WorkflowResponse: The response containing the workflow ID.
    """
    project_version = await _latest_project_version(payload.project_id)
    with use_project_context(payload.project_id, project_version):
        handle = await start_fvp_workflow(
            FVPWorkflowArgs(project_id=payload.project_id),
            project_id=payload.project_id,
            project_version=project_version,
        )
    try:
        await PlsApiClient.update_project_status(payload.project_id, "IN_PROGRESS")
    except Exception as e:
        logger.warn(
            action=EventAction.NOTIFY,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            default_event=LogEventDefault.GENERAL,
            message=(
                f"Started FVP workflow {handle.id}, but failed to update project "
                f"{payload.project_id} status to IN_PROGRESS: {e}"
            ),
        )
    # FVPWorkflow-<project_id>
    #   <random_uuid>
    return WorkflowResponse(parent_job_id=handle.id)


@router.post(
    "/suz/{norm_id}",
    response_model=WorkflowResponse,
)
async def start_suz_norm_workflow(
    norm_id: str,
    payload: Annotated[
        SucheZuordnungNormRequest,
        Depends(
            require_permission_from_body(
                SucheZuordnungNormRequest,
                "project_id",
                Permission.EXECUTE,
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
) -> WorkflowResponse:
    """
    Start the Suche & Zuordnung workflow for a single norm.

    NormData and document nodes are fetched from the examination service
    automatically by the workflow — only project_id is required in the payload.

    Args:
        norm_id: The examination service norm node UUID.
        payload: Project ID.

    Returns:
        WorkflowResponse containing the parent workflow ID.
    """
    project_version = await _latest_project_version(payload.project_id)
    workflow_id = project_scoped_workflow_id(
        str(SUCHE_ZUORDNUNG_NORM_WORKFLOW_ID),
        payload.project_id,
        project_version,
        norm_id,
    )
    with use_project_context(payload.project_id, project_version):
        handle = await start_workflow(
            workflow_id=SUCHE_ZUORDNUNG_NORM_WORKFLOW_ID,
            input=SucheZuordnungNormWorkflowInput(
                project_id=payload.project_id,
                norm_id=norm_id,
            ),
            task_queue=TASK_QUEUE,
            project_id=payload.project_id,
            project_version=project_version,
            _ORCHESTRATOR_ONLY_DO_NOT_USE_OR_YOU_WILL_GET_FIRED_ID=workflow_id,
            priority=_PRIORITY_HIGH,
        )
    return WorkflowResponse(parent_job_id=handle.id)


@router.post(
    "/mvp",
    response_model=WorkflowResponse,
)
async def start_batch_mvp_workflow(
    payload: Annotated[
        BatchMVPRequest,
        Depends(
            require_permission_from_body(
                BatchMVPRequest,
                "project_id",
                Permission.EXECUTE,
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
) -> WorkflowResponse:
    project_version = await _latest_project_version(payload.project_id)
    workflow_id = project_scoped_workflow_id(str(BATCH_MVP_WORKFLOW_ID), payload.project_id)
    try:
        with use_project_context(payload.project_id, project_version):
            handle = await start_workflow(
                workflow_id=BATCH_MVP_WORKFLOW_ID,
                input=BatchMVPWorkflowInput(project_id=payload.project_id),
                task_queue=settings.temporal.task_queue,
                project_id=str(payload.project_id),
                project_version=project_version,
                id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
                id_conflict_policy=WorkflowIDConflictPolicy.USE_EXISTING,
                _ORCHESTRATOR_ONLY_DO_NOT_USE_OR_YOU_WILL_GET_FIRED_ID=workflow_id,
            )
    except WorkflowAlreadyStartedError as exc:
        client = await get_temporal_client()
        handle = client.get_workflow_handle(
            workflow_id=workflow_id,
            run_id=exc.run_id,
        )
    return WorkflowResponse(parent_job_id=handle.id)


_PRIORITY_HIGH = Priority(fairness_key="priority", fairness_weight=2.0)


@router.post(
    "/bewertung",
    response_model=WorkflowResponse,
)
async def start_bewertung_workflow(
    payload: Annotated[
        BewertungRequest,
        Depends(
            require_permission_from_body(
                BewertungRequest,
                "project_id",
                Permission.EXECUTE,
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
) -> WorkflowResponse:
    project_version = await _latest_project_version(payload.project_id)
    workflow_id = project_scoped_workflow_id(
        str(BEWERTUNG_WORKFLOW_ID),
        payload.project_id,
        project_version,
        payload.norm_id,
    )
    try:
        with use_project_context(payload.project_id, project_version):
            handle = await start_workflow(
                workflow_id=BEWERTUNG_WORKFLOW_ID,
                input=BewertungInput(project_id=payload.project_id, norm_id=payload.norm_id),
                task_queue=settings.temporal.task_queue,
                project_id=str(payload.project_id),
                project_version=project_version,
                id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
                id_conflict_policy=WorkflowIDConflictPolicy.USE_EXISTING,
                _ORCHESTRATOR_ONLY_DO_NOT_USE_OR_YOU_WILL_GET_FIRED_ID=workflow_id,
                priority=_PRIORITY_HIGH,
            )
    except WorkflowAlreadyStartedError as exc:
        cause = exc.__cause__ or exc
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": getattr(getattr(cause, "status", None), "name", status.HTTP_409_CONFLICT),
                "message": getattr(cause, "message", str(cause)),
            },
        ) from exc
    return WorkflowResponse(parent_job_id=handle.id)


@router.post(
    "/risikohinweise",
    response_model=WorkflowResponse,
)
async def start_risikohinweise_workflow(
    payload: Annotated[
        RisikohinweiseRequest,
        Depends(
            require_permission_from_body(
                RisikohinweiseRequest,
                "project_id",
                Permission.EXECUTE,
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
) -> WorkflowResponse:
    project_version = await _latest_project_version(payload.project_id)
    workflow_id = project_scoped_workflow_id(
        str(RISIKOHINWEISE_WORKFLOW_ID),
        payload.project_id,
        project_version,
        payload.vae_node_id,
    )
    with use_project_context(payload.project_id, project_version):
        handle = await start_workflow(
            workflow_id=RISIKOHINWEISE_WORKFLOW_ID,
            input=RisikohinweiseWorkflowInput(project_id=payload.project_id, vae_node_id=payload.vae_node_id),
            task_queue=settings.temporal.task_queue,
            project_id=payload.project_id,
            project_version=project_version,
            id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE,
            id_conflict_policy=WorkflowIDConflictPolicy.USE_EXISTING,
            _ORCHESTRATOR_ONLY_DO_NOT_USE_OR_YOU_WILL_GET_FIRED_ID=workflow_id,
            priority=_PRIORITY_HIGH,
        )
    return WorkflowResponse(parent_job_id=handle.id)


@router.post(
    "/cancel/{workflow_id}",
    response_model=CancelWorkflowResponse,
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE]))],
)
async def cancel_workflow(workflow_id: str) -> CancelWorkflowResponse:
    """
    Cancel a running workflow.

    Args:
        workflow_id (str): The ID of the workflow to cancel.

    Returns:
        CancelWorkflowResponse: The response confirming the cancellation request.

    Raises:
        HTTPException: If the workflow is not found or cancellation fails.
    """
    try:
        await stop_workflow(workflow_id)
        logger.info(
            action=EventAction.NOTIFY,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.API,
            default_event=LogEventDefault.GENERAL,
            message=f"Stopped workflow {workflow_id}",
        )
        return CancelWorkflowResponse(workflow_id=workflow_id)
    except Exception as e:
        logger.warn(
            action=EventAction.NOTIFY,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            default_event=LogEventDefault.GENERAL,
            message=f"Failed to stop workflow {workflow_id}: {e}",
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to stop workflow {workflow_id}",
        ) from e
