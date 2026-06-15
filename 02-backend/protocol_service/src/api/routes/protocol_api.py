"""REST endpoints for the audit-trail / protocol API."""

from __future__ import annotations

import datetime
import json
import uuid

from authentification.dependencies import require_permissions
from authentification.enums import OidcRoles, Permission, Resource
from authentification.resolver import path_param
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from src.models.schemas.protocol_schemas import HistoryResponse, SourceFilter
from src.services.history import fetch_history
from src.services.history.query import HistoryQuery

router = APIRouter(prefix="/projects", tags=["Protocol"])


def _parse_iso_date(value: str | None) -> datetime.datetime | None:
    """Parse an ISO-8601 date string into a datetime. Raises 422 on invalid input."""
    if value is None:
        return None
    try:
        return datetime.datetime.fromisoformat(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Invalid date format: '{value}'. Expected ISO-8601 (e.g. '2025-10-01').",
        ) from None


@router.get(
    "/{project_id}/history",
    response_model=HistoryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get project audit trail",
    description="Returns a paginated, chronologically sorted list of all data changes for a project.",
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.AUDIT, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def get_project_history(
    project_id: uuid.UUID,
    from_date: str | None = Query(None, alias="from", description="Zeitraum-Start (ISO-8601)"),
    to_date: str | None = Query(None, alias="to", description="Zeitraum-Ende (ISO-8601)"),
    source: SourceFilter | None = Query(None, description="Filter: user, agent, or all"),
    service: str | None = Query(None, description="Filter: service key, e.g. 'formal_completeness'"),
    workflow_run_id: str | None = Query(
        None,
        description=(
            "Drill-down: filter to events of one workflow run. "
            "Implies ungrouped — returns the individual events of that group."
        ),
    ),
    request_id: str | None = Query(
        None,
        description=(
            "Drill-down: filter to events of one HTTP request. "
            "Implies ungrouped — returns the individual events of that group."
        ),
    ),
    ungrouped: bool = Query(
        False,
        description=(
            "Opt-out from collapsing. Default is collapsed: events sharing a "
            "workflow_run_id or request_id are folded into one item with group_count > 1. "
            "Set true for an explicit per-event stream (export, debug)."
        ),
    ),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> HistoryResponse:
    """Fetch audit trail for a project."""
    from_ts = _parse_iso_date(from_date)
    to_ts = _parse_iso_date(to_date)
    collapsed = not (ungrouped or workflow_run_id is not None or request_id is not None)
    items, total = await fetch_history(
        HistoryQuery(
            project_id=project_id,
            from_ts=from_ts,
            to_ts=to_ts,
            source=source,
            service=service,
            workflow_run_id=workflow_run_id,
            request_id=request_id,
            collapsed=collapsed,
            limit=limit,
            offset=offset,
        )
    )

    return HistoryResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=items,
    )


EXPORT_LIMIT = 10_000


@router.get(
    "/{project_id}/history/export",
    status_code=status.HTTP_200_OK,
    summary="Export project audit trail",
    description="Downloads the full audit trail for a project as a pretty-printed JSON file.",
    response_class=Response,
    responses={413: {"description": "Audit trail exceeds the export limit"}},
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.AUDIT, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def export_project_history(
    project_id: uuid.UUID,
    from_date: str | None = Query(None, alias="from", description="Zeitraum-Start (ISO-8601)"),
    to_date: str | None = Query(None, alias="to", description="Zeitraum-Ende (ISO-8601)"),
    source: SourceFilter | None = Query(None, description="Filter: user, agent, or all"),
    service: str | None = Query(None, description="Filter: service key, e.g. 'formal_completeness'"),
    request_id: str | None = Query(None, description="Filter: request ID"),
) -> Response:
    """Export full audit trail for a project as a downloadable JSON file.

    Always returns the full per-event stream (no workflow grouping) — exports
    are for completeness / compliance, not UI ergonomics.
    """
    from_ts = _parse_iso_date(from_date)
    to_ts = _parse_iso_date(to_date)
    items, total = await fetch_history(
        HistoryQuery(
            project_id=project_id,
            from_ts=from_ts,
            to_ts=to_ts,
            source=source,
            service=service,
            request_id=request_id,
            collapsed=False,
            limit=EXPORT_LIMIT,
            offset=0,
        )
    )
    if total > EXPORT_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"Audit trail has {total} entries but export is capped at "
                f"{EXPORT_LIMIT}. Use the paginated /history endpoint or apply "
                f"date/source/service filters to reduce the result."
            ),
        )
    payload = {
        "project_id": str(project_id),
        "total": total,
        "items": [item.model_dump(mode="json") for item in items],
    }
    return Response(
        content=json.dumps(payload, indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="history.json"'},
    )
