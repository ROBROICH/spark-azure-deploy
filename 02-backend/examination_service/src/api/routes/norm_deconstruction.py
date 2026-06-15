from authentification.dependencies import require_role
from authentification.enums import OidcRoles
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.database import get_db_session
from src.models.db.norm_deconstruction import NormDeconstruction
from src.models.schemas.norm_deconstruction import (
    NormDeconstructionCreate,
    NormDeconstructionResponse,
)

router = APIRouter(
    prefix="/norm-deconstructions",
    tags=["Norm Deconstructions"],
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.SERVICE]))],
)


@router.post("/", response_model=list[NormDeconstructionResponse])
async def upsert_norm_deconstructions(
    items: list[NormDeconstructionCreate],
    db: AsyncSession = Depends(get_db_session),
) -> list[NormDeconstructionResponse]:
    """Bulk upsert norm deconstructions. Updates existing entries on (jurabk, paragraph) conflict."""
    stmt = insert(NormDeconstruction).values([item.model_dump() for item in items])
    stmt = stmt.on_conflict_do_update(
        constraint="uq_norm_deconstruction_jurabk_paragraph",
        set_={"deconstruction": stmt.excluded.deconstruction},
    )
    stmt = stmt.returning(NormDeconstruction)
    result = await db.execute(stmt)
    await db.commit()
    return [NormDeconstructionResponse.model_validate(item) for item in result.scalars().all()]


@router.get("/", response_model=list[NormDeconstructionResponse])
async def get_norm_deconstructions(
    jurabk: str | None = Query(default=None),
    paragraph: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
) -> list[NormDeconstructionResponse]:
    """Get norm deconstructions, optionally filtered by jurabk and/or paragraph."""
    query = select(NormDeconstruction)
    if jurabk is not None:
        query = query.where(NormDeconstruction.jurabk == jurabk)
    if paragraph is not None:
        query = query.where(NormDeconstruction.paragraph == paragraph)
    result = await db.execute(query)
    return [NormDeconstructionResponse.model_validate(item) for item in result.scalars().all()]
