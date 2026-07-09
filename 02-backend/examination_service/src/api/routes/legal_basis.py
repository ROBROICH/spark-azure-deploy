from enum import Enum
from uuid import UUID

from authentification.dependencies import require_permissions, require_role
from authentification.enums import OidcRoles, Permission, Resource
from authentification.resolver import path_param
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from node_crud import ProjectVersionLockedError, build_http_write_version_validator
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.settings import settings
from src.db.database import get_db_session
from src.models.schemas.legal_basis import LegalBasisAddNormRequest, LegalBasisAddNormResponse, LegalBasisNormResponse
from src.services.legal_basis import add_legal_basis_norm_to_project, fetch_legal_basis_norm_page

router = APIRouter(
    prefix="/legal-basis",
    tags=["Legal Basis"],
    dependencies=[Depends(require_role(allowed_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE]))],
)

validate_project_write_version = build_http_write_version_validator(settings.PROJECT_LOGIC_SERVICE_URL)


class BundeslandParam(str, Enum):
    BY = "BY"
    BW = "BW"
    BE = "BE"
    BB = "BB"
    HB = "HB"
    HH = "HH"
    HE = "HE"
    MV = "MV"
    NI = "NI"
    NW = "NW"
    RP = "RP"
    SL = "SL"
    SN = "SN"
    ST = "ST"
    SH = "SH"
    TH = "TH"


@router.get("/norms", response_model=list[LegalBasisNormResponse])
async def get_legal_basis_norms(
    response: Response,
    jurabk: str | None = Query(default=None, description="Law abbreviation / Jura-BK."),
    paragraph_nr: str | None = Query(default=None, description="Paragraph number, e.g. 44 or § 44."),
    doknr: str | None = Query(default=None, description="Exact law database document id."),
    bundesland: BundeslandParam | None = Query(
        default=None, description="Optional state discriminator, e.g. BY or NW."
    ),
    limit: int | None = Query(default=None, ge=1, description="Optional page size for returned norms."),
    offset: int = Query(default=0, ge=0, description="Number of matching norms to skip before applying limit."),
    db: AsyncSession = Depends(get_db_session),
) -> list[LegalBasisNormResponse]:
    page = await fetch_legal_basis_norm_page(
        db=db,
        jurabk=jurabk,
        paragraph_nr=paragraph_nr,
        doknr=doknr,
        bundesland=bundesland.value if bundesland else None,
        limit=limit,
        offset=offset,
    )
    response.headers["X-Total-Count"] = str(page.total)
    response.headers["X-Returned-Count"] = str(len(page.items))
    response.headers["X-Offset"] = str(page.offset)
    if page.limit is not None:
        response.headers["X-Limit"] = str(page.limit)
    response.headers["X-Has-More"] = "true" if page.next_offset is not None else "false"
    if page.next_offset is not None:
        response.headers["X-Next-Offset"] = str(page.next_offset)
    return page.items


@router.post(
    "/projects/{project_id}/norms",
    response_model=LegalBasisAddNormResponse,
    operation_id="addLegalBasisNormsToProject",
    summary="Add law database norms to a project topic",
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.UPDATE, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def add_legal_basis_norm(
    project_id: UUID,
    payload: LegalBasisAddNormRequest,
    project_version: int = Query(
        ...,
        ge=1,
        description="Target project version. Must be the current writable project version.",
    ),
    db: AsyncSession = Depends(get_db_session),
) -> LegalBasisAddNormResponse:
    try:
        await validate_project_write_version(project_id, project_version)
    except (ProjectVersionLockedError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return await add_legal_basis_norm_to_project(
        db=db,
        project_id=project_id,
        project_version=project_version,
        payload=payload,
    )
