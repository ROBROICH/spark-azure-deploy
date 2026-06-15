"""API routes for objection management."""

import uuid
from typing import Annotated

from authentification.dependencies import require_permissions, require_role
from authentification.enums import OidcRoles, Permission, Resource
from authentification.resolver import path_param
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db.database import get_db_session
from src.models.schemas.ewms_schemas import (
    ArgumentExtractionRequest,
    ArgumentExtractionResponse,
    ClassificationFailedRequest,
    ClassificationFailedResponse,
    ClassificationRequest,
    ClassificationResponse,
    InjectionDetectedRequest,
    InjectionDetectedResponse,
    ProcessedFileIdsResponse,
)
from src.services import objection_service

router = APIRouter(prefix="/{project_id}/ewms", tags=["EWMS Workflow"])


@router.get(
    "/processed-file-ids",
    response_model=ProcessedFileIdsResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.READ, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def list_processed_file_ids(
    project_id: uuid.UUID,
    project_version: Annotated[int | None, Query(ge=1)] = None,
    db: AsyncSession = Depends(get_db_session),
) -> ProcessedFileIdsResponse:
    """Return EWMS document file IDs that have completed extraction and classification."""
    return await objection_service.list_processed_file_ids(
        db=db,
        project_id=project_id,
        project_version=project_version,
    )


@router.post(
    "/argument-extraction",
    response_model=ArgumentExtractionResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.CREATE, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def insert_argument_extraction_results(
    project_id: uuid.UUID,
    body: ArgumentExtractionRequest,
    project_version: Annotated[int, Query(ge=1)],
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> ArgumentExtractionResponse:
    """Store argument extraction workflow results.

    Creates one BeteiligungsEingang per document and one Argument per extracted
    argument. Returns the generated DB IDs so callers can pass them to the
    classification endpoint.
    """
    return await objection_service.insert_argument_extraction_results(
        db=db,
        project_id=project_id,
        project_version=project_version,
        body=body,
        request=request,
    )


@router.patch(
    "/classification",
    response_model=ClassificationResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.UPDATE, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def update_classification_results(
    project_id: uuid.UUID,
    body: ClassificationRequest,
    project_version: Annotated[int, Query(ge=1)],
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> ClassificationResponse:
    """Store classification workflow results.

    Updates topic_id and optional sub_topic_id on each Argument.
    """
    return await objection_service.update_classification_results(
        db=db,
        project_id=project_id,
        project_version=project_version,
        body=body,
        request=request,
    )


@router.patch(
    "/classification-failed",
    response_model=ClassificationFailedResponse,
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.SERVICE]))],
)
async def mark_classification_failed(
    project_id: uuid.UUID,
    body: ClassificationFailedRequest,
    project_version: Annotated[int, Query(ge=1)],
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> ClassificationFailedResponse:
    """Mark BeteiligungsEingangs as classification_status=FAILED.

    Called by the EWMS workflow when classification has exhausted Temporal
    retries so the FE knows those documents will not get topic assignments.
    """
    return await objection_service.mark_classification_failed(
        db=db,
        project_id=project_id,
        project_version=project_version,
        body=body,
        request=request,
    )


@router.post(
    "/injection-detected",
    response_model=InjectionDetectedResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.CREATE, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def mark_injection_detected(
    project_id: uuid.UUID,
    body: InjectionDetectedRequest,
    project_version: Annotated[int, Query(ge=1)],
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> InjectionDetectedResponse:
    """Persist injection-detected documents as PROMPT_INJECTION_ERROR.

    Creates or updates BeteiligungsEingang with extraction_status=PROMPT_INJECTION_ERROR
    and classification_status=DONE. Called by EWMSOrchestratorWorkflow before argument extraction.
    Idempotent — safe to retry.
    """
    return await objection_service.mark_injection_detected(
        db=db,
        project_id=project_id,
        project_version=project_version,
        body=body,
        request=request,
    )
