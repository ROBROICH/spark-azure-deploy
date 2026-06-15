import uuid
from collections.abc import Sequence

from audit_client import audit_context_kwargs
from authentification.dependencies import require_role
from authentification.enums import OidcRoles
from fastapi import APIRouter, Depends, Request

from src.api.dependencies import get_template_service
from src.models.db_models import VaeTemplate, VaeTemplateNode
from src.models.schemas.risks_schemas import SuccessResponse
from src.models.schemas.template_schemas import (
    AssignTemplateRequest,
    CreateTemplateRequest,
    TemplateNodeInput,
    TemplateResponse,
)
from src.services.template_service import TemplateService

router = APIRouter(
    prefix="/templates",
    tags=["templates"],
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE]))],
)


@router.post("", response_model=TemplateResponse)
async def create_template(
    payload: CreateTemplateRequest, service: TemplateService = Depends(get_template_service)
) -> VaeTemplate:
    """Create a new template."""
    return await service.create_template(
        name=payload.name,
        project_type_id=payload.project_type_id,
    )


@router.get("", response_model=list[TemplateResponse])
async def list_templates(
    project_type_id: uuid.UUID, service: TemplateService = Depends(get_template_service)
) -> Sequence[VaeTemplate]:
    """List all templates."""
    return await service.list_templates(project_type_id=project_type_id)


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(template_id: uuid.UUID, service: TemplateService = Depends(get_template_service)) -> VaeTemplate:
    """Get a template."""
    return await service.get_template(template_id=template_id)


@router.post("/{template_id}/activate")
async def activate_template(
    template_id: uuid.UUID, service: TemplateService = Depends(get_template_service)
) -> SuccessResponse:
    """Activate a template."""
    await service.activate_template(template_id)

    return SuccessResponse(success=True)


@router.post("/{template_id}/nodes", response_model=SuccessResponse)
async def add_nodes(
    template_id: uuid.UUID,
    nodes: list[TemplateNodeInput],
    service: TemplateService = Depends(get_template_service),
) -> SuccessResponse:
    """Add nodes to a template."""
    await service.add_template_nodes(template_id, nodes)

    return SuccessResponse(success=True)


@router.get("/{template_id}/nodes", response_model=None)
async def get_nodes(
    template_id: uuid.UUID, service: TemplateService = Depends(get_template_service)
) -> Sequence[VaeTemplateNode]:
    return await service.get_template_nodes(template_id)


@router.post("/{project_id}/assign-template/{project_type_id}", response_model=SuccessResponse)
async def assign_template(
    request: Request,
    project_id: uuid.UUID,
    project_type_id: uuid.UUID,
    payload: AssignTemplateRequest,
    service: TemplateService = Depends(get_template_service),
) -> SuccessResponse:
    """Assign a template to a project."""
    await service.assign_template(
        project_type_id=project_type_id,
        project_id=project_id,
        data=payload,
        audit_context=audit_context_kwargs(request),
    )
    return SuccessResponse(success=True)
