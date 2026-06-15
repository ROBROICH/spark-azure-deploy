"""DB access for the history aggregator — executes queries, maps rows to models."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db.database import session_for
from src.models.schemas.protocol_schemas import HistoryItem
from src.services.history.mapper import _build_history_item
from src.services.history.query import HistoryQuery
from src.services.history.query_builder import _build_union_query

SERVICE_LABELS: dict[str, str] = {
    "project_logic": "Verfahrensdaten",
    "formal_completeness": "Formale Vollständigkeitsprüfung",
    "plausibility": "Plausibilitätsprüfung",
    "comment": "Kommentare",
    "supplementary": "Ergänzungsanfragen",
    "document_management": "Dokumente",
    "administrative_draft": "Verwaltungsentwurf",
    "examination": "Rechtliche Prüfung",
    "objections_management": "Behörden- und Öffentlichkeitsbeteiligung",
}

AUDIT_LOG_ENABLED_SERVICES: frozenset[str] = frozenset(
    {
        "project_logic",
        "examination",
        "formal_completeness",
        "plausibility",
        "administrative_draft",
        "comment",
        "supplementary",
        "document_management",
        "objections_management",
    }
)


async def _run_aggregate_query(
    session: AsyncSession,
    sql: str,
    params: dict[str, Any],
) -> list[dict[str, Any]]:
    result = await session.execute(text(sql), params)
    rows = result.mappings().all()
    return [dict(r) for r in rows]


async def _fetch_for_db(
    db_key: str,
    tables: list[str],
    query: HistoryQuery,
) -> tuple[list[HistoryItem], int]:
    label = SERVICE_LABELS.get(db_key, db_key)
    sql, params = _build_union_query(
        tables,
        query.project_id,
        query.from_ts,
        query.to_ts,
        query.oversample,
        source_filter=query.source_value,
        has_audit_log=db_key in AUDIT_LOG_ENABLED_SERVICES,
        collapsed=query.collapsed,
        workflow_run_id_filter=query.workflow_run_id,
        request_id_filter=query.request_id,
    )
    raw_rows: list[dict[str, Any]] = []
    async for session in session_for(db_key):
        raw_rows = await _run_aggregate_query(session, sql, params)

    total: int = int(raw_rows[0]["total_count"]) if raw_rows else 0
    items = [_build_history_item(r, service=db_key, service_label=label) for r in raw_rows]
    return items, total
