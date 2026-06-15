"""API routes for Risks (Risiken)."""

from collections.abc import Sequence
from uuid import UUID

from authentification.dependencies import require_role
from authentification.enums import OidcRoles
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db.database import get_db_session
from src.models.db_models import Risk
from src.models.schemas.risks_schemas import (
    CreateRisksRequest,
    RiskResponse,
    UpdateRiskRequest,
)
from src.services import risks_service

router = APIRouter(
    tags=["Risiken"], dependencies=[Depends(require_role(allowed_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE]))]
)


@router.get("/risks/{project_id}", response_model=list[RiskResponse])
async def get_risks(project_id: UUID, db: AsyncSession = Depends(get_db_session)) -> Sequence[Risk]:
    """
    Get all risks for a project. Returns an empty list if none exist.

    Args:
        project_id (UUID): The ID of the project.
    """
    return await risks_service.get_risks(db=db, project_id=project_id)


@router.post(
    "/risks/{project_id}",
    status_code=status.HTTP_201_CREATED,
    response_model=list[RiskResponse],
)
async def create_risks(
    project_id: UUID,
    payload: CreateRisksRequest,
    db: AsyncSession = Depends(get_db_session),
) -> list[Risk]:
    """
    Create new risks for a project.

    Args:
        project_id (UUID): The ID of the project.
        payload (CreateRisksRequest): The risks to create.
    """
    return await risks_service.create_risks(db=db, risks_payload=payload, project_id=project_id)


@router.patch("/risks/{risk_id}", response_model=RiskResponse)
async def update_risk(
    risk_id: UUID,
    payload: UpdateRiskRequest,
    db: AsyncSession = Depends(get_db_session),
) -> Risk:
    """
    Update a risk. All fields in the payload are optional.
    Returns the updated risk.

    Args:
        risk_id (UUID): The ID of the risk to update.
        payload (UpdateRiskRequest): The fields to be updated.
    """
    return await risks_service.update_risk(
        db=db,
        risk_id=risk_id,
        payload=payload,
    )
