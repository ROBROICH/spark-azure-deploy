from uuid import UUID

from audit_client import audit_context_kwargs
from authentification.dependencies import require_permissions, require_role
from authentification.enums import OidcRoles, Permission, Resource
from authentification.resolver import path_param
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db.database import get_db_session
from src.models.schemas.fcs_types import (
    CreateRequiredDocumentTypeRequest,
    DocumentAssignmentItem,
    DocumentAssignmentsResponse,
    FormalCompletenessCheckResults,
    InitializeRequiredDocumentTypesRequest,
    JobDoneRequest,
    JobDoneResponse,
    PatchDocumentByFileIdRequest,
    PatchRequiredDocumentTypeRequest,
    RequiredDocumentResponse,
    RequiredDocumentTypesResponse,
    SuccessResponse,
    TemplateDocumentTypeResponse,
)
from src.services.fcs_service import (
    DocumentAssignmentPatch,
    RequiredDocumentTypePatch,
    create_custom_document_type,
    delete_custom_document_type,
    get_document_assignments,
    get_required_document_types_by_category,
    get_results_for_project,
    get_template_document_types,
    initialize_required_document_types_from_templates,
    patch_document_by_file_id,
    patch_required_document_type,
)
from src.services.job_service import process_job_results

router = APIRouter(prefix="/{project_id}", tags=["Documents"])


@router.get(
    "/template-document-types",
    response_model=list[TemplateDocumentTypeResponse],
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.READ, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def get_template(
    project_id: UUID,
    project_version: int = Query(..., ge=1),
    db: AsyncSession = Depends(get_db_session),
) -> list[TemplateDocumentTypeResponse]:
    """Return template document types for a project"""
    return await get_template_document_types(project_id, db, project_version=project_version)


@router.get(
    "",
    response_model=FormalCompletenessCheckResults,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.READ, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def get_formal_completeness_results(
    project_id: UUID,
    project_version: int | None = Query(None, ge=1),
    db: AsyncSession = Depends(get_db_session),
) -> FormalCompletenessCheckResults:
    """Return the formal completeness check results for the specified project."""
    return await get_results_for_project(project_id, db, project_version=project_version)


@router.get(
    "/required-document-types",
    response_model=RequiredDocumentTypesResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.READ, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def get_required_document_types(
    project_id: UUID,
    project_version: int | None = Query(None, ge=1),
    db: AsyncSession = Depends(get_db_session),
) -> RequiredDocumentTypesResponse:
    """Return categories with their required document types for the specified project."""
    return await get_required_document_types_by_category(
        project_id,
        db,
        project_version=project_version,
    )


@router.post(
    "/required-document-types/initialize",
    response_model=SuccessResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.SERVICE]))],
)
async def initialize_required_document_types(
    project_id: UUID,
    payload: InitializeRequiredDocumentTypesRequest,
    project_version: int = Query(..., ge=1),
    db: AsyncSession = Depends(get_db_session),
) -> SuccessResponse:
    """Seed project required document types from the assigned template."""
    await initialize_required_document_types_from_templates(
        project_id,
        payload.project_type_id,
        db,
        project_version=project_version,
    )
    return SuccessResponse()


@router.post(
    "/required-document-types",
    response_model=RequiredDocumentResponse,
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
async def create_required_document_type(
    project_id: UUID,
    payload: CreateRequiredDocumentTypeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> RequiredDocumentResponse:
    """Create a new custom document type in the 'Benutzerdefiniert' category."""
    return await create_custom_document_type(
        project_id,
        payload.document_name,
        db,
        audit_context=audit_context_kwargs(request),
    )


@router.patch(
    "/required-document-types/{document_type_id}",
    response_model=RequiredDocumentResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.UPDATE, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def patch_required_doc_type(
    project_id: UUID,
    document_type_id: UUID,
    payload: PatchRequiredDocumentTypeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> RequiredDocumentResponse:
    """Partially update a required document type.

    - `document_name` is only allowed for custom types (origin=custom); returns 403 for system types.
    - `is_resolved` is allowed for both system and custom types.
    """
    patch = payload.model_dump(exclude_unset=True)
    typed_patch: RequiredDocumentTypePatch = {}
    if "document_name" in patch:
        document_name = payload.document_name
        if document_name is not None:
            typed_patch["document_name"] = document_name
    if "is_resolved" in patch:
        is_resolved = payload.is_resolved
        if is_resolved is not None:
            typed_patch["is_resolved"] = is_resolved
    return await patch_required_document_type(
        project_id,
        document_type_id,
        typed_patch,
        db,
        audit_context=audit_context_kwargs(request),
    )


@router.delete(
    "/required-document-types/{document_type_id}",
    response_model=SuccessResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.DELETE, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def delete_required_document_type(
    project_id: UUID,
    document_type_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> SuccessResponse:
    """Delete a required document type. Only allowed for custom types (origin=custom)."""
    await delete_custom_document_type(
        project_id,
        document_type_id,
        db,
        audit_context=audit_context_kwargs(request),
    )
    return SuccessResponse()


@router.get(
    "/document-assignments",
    response_model=DocumentAssignmentsResponse,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.READ, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def get_doc_assignments(
    project_id: UUID,
    project_version: int | None = Query(None, ge=1),
    db: AsyncSession = Depends(get_db_session),
) -> DocumentAssignmentsResponse:
    """Return AI-suggested and human document type assignments for all documents in the project."""
    return await get_document_assignments(
        project_id,
        db,
        project_version=project_version,
    )


@router.patch(
    "/documents/{file_id}",
    response_model=DocumentAssignmentItem,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.UPDATE, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def patch_document(
    project_id: UUID,
    file_id: UUID,
    payload: PatchDocumentByFileIdRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> DocumentAssignmentItem:
    """Set the human document type assignment for a document. AI fields are read-only."""
    patch = payload.model_dump(exclude_unset=True)
    typed_patch: DocumentAssignmentPatch = {}
    if "human_required_document_type_id" in patch:
        typed_patch["human_required_document_type_id"] = payload.human_required_document_type_id
    return await patch_document_by_file_id(
        project_id,
        file_id,
        typed_patch,
        db,
        audit_context=audit_context_kwargs(request),
    )


@router.post(
    "/results",
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
    """Process completed formal completeness check job results.

    Fetches the results JSON from Document Management Service using the provided
    file_id, clears existing data for the project, and stores the new results.
    """
    return await process_job_results(project_id, payload.file_id, db, project_version=project_version)
