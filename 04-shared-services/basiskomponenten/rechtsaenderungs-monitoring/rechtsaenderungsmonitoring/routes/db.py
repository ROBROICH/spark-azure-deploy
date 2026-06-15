"""routes for database queries"""
from fastapi import APIRouter, Query, Depends, Request, HTTPException
from typing import Optional, List, Union, Annotated

from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from db_services_shared.models.db.database import get_db_session

from authentification.dependencies import require_role
from authentification.enums import OidcRoles

from rechtsaenderungsmonitoring.schemas.api import (
    UpdateResponse,
    UpdateResponseFull,
)
from rechtsaenderungsmonitoring.schemas.db import Norm

db_router = APIRouter(
    dependencies=[
        Depends(require_role(allowed_roles=[OidcRoles.SERVICE])),
    ],
    responses={404: {"description": "No results found for given criteria"}},
)

SessionDep = Annotated[AsyncSession, Depends(get_db_session)]


@db_router.get(
    "/pending-updates",
    response_model=List[Union[UpdateResponse, UpdateResponseFull]],
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE]))],
)
async def get_pending(
    request: Request,
    session: SessionDep,
    jurabk: Optional[str] = Query(None, description="shortname of the law"),
    paragraph_nr: Optional[str] = Query(
        None, description="paragraph_nr as string (including alphabetic part)"
    ),
    detail: Optional[bool] = Query(False, description="wether to include change text"),
) -> List[Union[UpdateResponse, UpdateResponseFull]]:
    """
    returns all norms that are pending an update in the system,
    filter output using `jurabk` and `paragraph_nr` parameters,
    """
    stmt = select(Norm)
    if jurabk is not None:
        stmt = stmt.where(Norm.jurabk == jurabk)
    if paragraph_nr is not None:
        stmt = stmt.where(Norm.paragraph_nr == paragraph_nr)

    query_result = await session.execute(stmt)
    norms_result: list[Norm] = query_result.all()

    if len(norms_result) < 1:
        raise HTTPException(404, "no changes found")

    result = []
    if detail:
        result = [
            UpdateResponseFull(
                jurabk=norm[0].jurabk, affected_norms=[norm[0]], valid_from=norm[0].valid_from
            )
            for norm in norms_result
        ]
    else:
        result = [
            UpdateResponse(
                jurabk=norm[0].jurabk,
                affected_norms=[norm[0].paragraph_nr],
                valid_from=norm[0].valid_from,
            )
            for norm in norms_result
        ]
    return result
