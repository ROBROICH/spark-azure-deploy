"""Service layer for risk operations."""

from collections.abc import Sequence
from uuid import UUID, uuid4

import httpx
from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)
from fastapi import HTTPException, status
from node_crud.exceptions import ProjectVersionLockedError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.settings import settings
from src.exceptions.exceptions import NotFoundError
from src.models.db_models import Risk
from src.models.schemas.risks_schemas import (
    CreateRisksRequest,
    UpdateRiskRequest,
)
from src.utils.logger import logger

UPSTREAM_BODY_LOG_LIMIT = 2_000


def _project_version_conflict_message(correlation_id: str) -> str:
    return (
        "Project version cannot be modified while version creation is locked. "
        f"Retry after the current version operation completes. correlation_id={correlation_id}"
    )


async def _get_latest_project_version(project_id: UUID) -> int:
    url = f"{settings.PROJECT_LOGIC_SERVICE_URL.rstrip('/')}/projects/{project_id}/latest-version"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not reach project logic service: {exc}",
        ) from exc
    response.raise_for_status()
    body = response.json()
    latest_version = body.get("latest_version", body.get("latestVersion"))
    if latest_version is None:
        raise KeyError("latest_version")
    return int(latest_version)


async def _validate_project_write_version(project_id: UUID, project_version: int) -> int:
    url = f"{settings.PROJECT_LOGIC_SERVICE_URL.rstrip('/')}/projects/{project_id}/version-lock/validate-write"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json={"project_version": project_version})
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not reach project logic service: {exc}",
        ) from exc
    if response.status_code == status.HTTP_409_CONFLICT:
        correlation_id = str(uuid4())
        logger.warn(
            action=EventAction.VALIDATE,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            project_id=str(project_id),
            message=(
                "Project write-version validation rejected by upstream "
                f"(status={response.status_code}, correlation_id={correlation_id}, "
                f"body={response.text[:UPSTREAM_BODY_LOG_LIMIT]!r})"
            ),
        )
        raise ProjectVersionLockedError(str(project_id), _project_version_conflict_message(correlation_id))
    response.raise_for_status()
    body = response.json()
    latest_version = body.get("latest_version", body.get("latestVersion"))
    if latest_version is None:
        raise KeyError("latest_version")
    return int(latest_version)


async def create_risks(db: AsyncSession, risks_payload: CreateRisksRequest, project_id: UUID) -> list[Risk]:
    logger.info(
        action=EventAction.WRITE,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.DATABASE,
        default_event=LogEventDefault.DB_WRITE,
        message=f"Creating risks for project {project_id}",
    )

    project_version = await _get_latest_project_version(project_id)
    await _validate_project_write_version(project_id, project_version)
    risk_instances = [
        Risk(
            project_id=project_id,
            project_version=project_version,
            problem=r.problem,
            recommendation=r.recommendation,
            quote=r.quote,
            severity=r.severity,
            implication=r.implication,
            vae_node_id=r.vae_node_id,
        )
        for r in risks_payload.risks
    ]
    db.add_all(risk_instances)
    await db.flush()
    await db.commit()

    logger.info(
        action=EventAction.WRITE,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.DATABASE,
        default_event=LogEventDefault.DB_WRITE,
        message=f"Created {len(risk_instances)} risks for project {project_id}",
    )
    return risk_instances


async def get_risks(db: AsyncSession, project_id: UUID) -> Sequence[Risk]:
    logger.info(
        action=EventAction.READ,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.DATABASE,
        default_event=LogEventDefault.DB_READ,
        message=f"Retrieving risks for project {project_id}",
    )

    project_version = await _get_latest_project_version(project_id)

    query = select(Risk).where(
        Risk.project_id == project_id,
        Risk.project_version == project_version,
        Risk.is_deleted.is_(False),
    )
    result = await db.execute(query)
    risks = result.scalars().all()

    logger.info(
        action=EventAction.READ,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.DATABASE,
        default_event=LogEventDefault.DB_READ,
        message=f"Retrieved {len(risks)} risks for project {project_id}",
    )
    return risks


async def update_risk(
    db: AsyncSession,
    risk_id: UUID,
    payload: UpdateRiskRequest,
) -> Risk:
    logger.info(
        action=EventAction.CHANGE,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.DATABASE,
        default_event=LogEventDefault.DB_WRITE,
        message=f"Updating risk risk_id={risk_id}",
    )

    latest_known_risk = (
        await db.execute(select(Risk).where(Risk.id == risk_id).order_by(Risk.project_version.desc()).limit(1))
    ).scalar_one_or_none()
    if latest_known_risk is None:
        raise NotFoundError("Risk not found")

    project_version = await _get_latest_project_version(latest_known_risk.project_id)
    await _validate_project_write_version(latest_known_risk.project_id, project_version)
    query = select(Risk).where(
        Risk.id == risk_id,
        Risk.project_version == project_version,
        Risk.is_deleted.is_(False),
    )
    result = await db.execute(query)
    risk = result.scalar_one_or_none()

    if not risk:
        raise NotFoundError("Risk not found")

    update_data = payload.model_dump(exclude_unset=True)

    if update_data:
        for key, value in update_data.items():
            setattr(risk, key, value)
        await db.flush()

    await db.commit()

    logger.info(
        action=EventAction.CHANGE,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.DATABASE,
        default_event=LogEventDefault.DB_WRITE,
        message=f"Successfully updated risk {risk_id} with fields: {list(update_data.keys())}",
    )
    return risk
