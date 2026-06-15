"""SQL generation for the history aggregator — no DB access."""

from __future__ import annotations

import datetime
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

HISTORY_SOURCES: list[tuple[str, str]] = [
    # project_logic_service
    ("project_logic", "project"),
    ("project_logic", "applicant"),
    ("project_logic", "topic"),
    ("project_logic", "topic_norm"),
    ("project_logic", "deadline"),
    # formal_completeness_check
    ("formal_completeness", "category"),
    ("formal_completeness", "document"),
    ("formal_completeness", "document_type"),
    ("formal_completeness", "table_of_content_notes"),
    # comment_service
    ("comment", "comment"),
    # supplementary_requests_service
    ("supplementary", "supplementary_request"),
    # plausibility_notes
    ("plausibility", "plausibility_note"),
    # document_management_service
    ("document_management", "file"),
    ("document_management", "zip_file"),
    # administrative_file_draft
    ("administrative_draft", "risks"),
    ("administrative_draft", "vae_node"),
    # examination_service
    ("examination", "gesetz"),
    ("examination", "norm"),
    ("examination", "bewertung"),
    ("examination", "bewertung_kapitel"),
    ("examination", "dokument"),
    ("examination", "fundstelle"),
    # objections_management_service
    ("objections_management", "beteiligungs_eingang"),
    ("objections_management", "argument"),
]

ALLOWED_TABLES: frozenset[str] = frozenset(table for _, table in HISTORY_SOURCES)

# Tables whose rows are themselves the project root and therefore have no
# ``project_id`` FK — the owning project is identified by ``id``. For every
# other table we filter on ``project_id``.
_PROJECT_ID_IS_SELF: frozenset[str] = frozenset({"project"})


def _project_scope_clause(table: str, alias: str) -> str:
    column = "id" if table in _PROJECT_ID_IS_SELF else "project_id"
    return f"{alias}.{column} = :project_id"


def _date_filter(
    from_ts: datetime.datetime | None,
    to_ts: datetime.datetime | None,
    params: dict[str, Any],
    *,
    col: str,
) -> str:
    """Build a WHERE-clause fragment filtering on col."""
    if from_ts is not None and to_ts is not None:
        params["from_ts"] = from_ts
        params["to_ts"] = to_ts
        return f"AND {col} BETWEEN :from_ts AND :to_ts"
    if from_ts is not None:
        params["from_ts"] = from_ts
        return f"AND {col} >= :from_ts"
    if to_ts is not None:
        params["to_ts"] = to_ts
        return f"AND {col} <= :to_ts"
    return ""


@dataclass(frozen=True)
class _Cond:
    sql: str
    py: Callable[[dict[str, Any]], bool]


def _all(*conds: _Cond) -> _Cond:
    return _Cond(
        "(" + " AND ".join(c.sql for c in conds) + ")",
        lambda r: all(c.py(r) for c in conds),
    )


def _is_null(col: str) -> _Cond:
    return _Cond(f"{col} IS NULL", lambda r: r.get(col) is None)


def _is_not_null(col: str) -> _Cond:
    return _Cond(f"{col} IS NOT NULL", lambda r: r.get(col) is not None)


_IS_USER: _Cond = _all(
    _is_null("workflow_run_id"),
    _is_null("workflow_type"),
    _is_not_null("actor_user_id"),
)


def classify_source(row: dict[str, Any]) -> str:
    """Classify a history row as ``user`` or ``agent`` (see ``_IS_USER``)."""
    return "user" if _IS_USER.py(row) else "agent"


def _source_filter_predicate(source_filter: str | None) -> str | None:
    """Predicate (no WHERE keyword) to filter the UNION result by source."""
    if not source_filter or source_filter == "all":
        return None
    if source_filter == "user":
        return _IS_USER.sql
    if source_filter == "agent":
        return f"NOT {_IS_USER.sql}"
    raise ValueError(f"Unknown source_filter: {source_filter}")


def _build_table_branches(
    tables: list[str],
    from_ts: datetime.datetime | None,
    to_ts: datetime.datetime | None,
    params: dict[str, Any],
) -> str:
    """Build the per-table UNION ALL branches (CREATE-A, CREATE-B, UPDATE, DELETE).

    Each table contributes four branches:

    * CREATE-A — main row that was never updated (no history for its id)
    * CREATE-B — earliest history row per id (the original state before
      the first update/delete; only needed because the trigger runs with
      ``include_current_version_in_history=false``, so the original
      version of an updated row lives in ``_history``, not the main table)
    * UPDATE  — history row whose ``upper(sys_period)`` matches a later
      version's ``lower(sys_period)`` (either another history row or the
      current main row). The LATERAL subquery picks the actual
      post-update state instead of the always-current main row, which
      matters for entities that were updated multiple times or deleted
      afterwards.
    * DELETE  — history row with no surviving main row and
      ``upper(sys_period)`` equal to the max upper for that id.

    """
    branches: list[str] = []

    for table in tables:
        if table not in ALLOWED_TABLES:
            raise ValueError(f"Table '{table}' not in ALLOWED_TABLES — refusing SQL build.")

        main_scope = _project_scope_clause(table, "t")
        history_scope = _project_scope_clause(table, "h")

        # CREATE-A: row never updated — lower(main.sys_period) is the create time.
        create_a_filter = _date_filter(from_ts, to_ts, params, col="lower(t.sys_period)")
        branches.append(f"""
            SELECT
                '{table}'::text                    AS entity_type,
                'create'::text                     AS change_type,
                t.id                               AS id,
                to_jsonb(t.*)->>'update_type'      AS update_type,
                lower(t.sys_period)                AS ts,
                to_jsonb(t.*)                      AS new_row,
                NULL::jsonb                        AS old_row
            FROM {table} t
            WHERE {main_scope}
              AND NOT EXISTS (
                  SELECT 1 FROM {table}_history h WHERE h.id = t.id
              )
              {create_a_filter}
        """)

        # CREATE-B: row was updated/deleted later — initial state lives in the
        # earliest history row (trigger writes the OLD version on UPDATE).
        create_b_filter = _date_filter(from_ts, to_ts, params, col="lower(h.sys_period)")
        branches.append(f"""
            SELECT
                '{table}'::text                    AS entity_type,
                'create'::text                     AS change_type,
                h.id                               AS id,
                to_jsonb(h.*)->>'update_type'      AS update_type,
                lower(h.sys_period)                AS ts,
                to_jsonb(h.*)                      AS new_row,
                NULL::jsonb                        AS old_row
            FROM {table}_history h
            WHERE {history_scope}
              AND lower(h.sys_period) = (
                  SELECT min(lower(h2.sys_period))
                  FROM {table}_history h2
                  WHERE h2.id = h.id
              )
              {create_b_filter}
        """)

        # UPDATE: event time = upper(h.sys_period); new_row = the version
        # that started right there (next history row, or current main row
        # for the last update). LATERAL with no match drops deletes.
        update_filter = _date_filter(from_ts, to_ts, params, col="upper(h.sys_period)")
        branches.append(f"""
            SELECT
                '{table}'::text                    AS entity_type,
                'update'::text                     AS change_type,
                h.id                               AS id,
                to_jsonb(h.*)->>'update_type'      AS update_type,
                upper(h.sys_period)                AS ts,
                n.next_row                         AS new_row,
                to_jsonb(h.*)                      AS old_row
            FROM {table}_history h
            CROSS JOIN LATERAL (
                SELECT to_jsonb(h2.*) AS next_row
                FROM {table}_history h2
                WHERE h2.id = h.id
                  AND lower(h2.sys_period) = upper(h.sys_period)
                UNION ALL
                SELECT to_jsonb(t.*) AS next_row
                FROM {table} t
                WHERE t.id = h.id
                  AND lower(t.sys_period) = upper(h.sys_period)
                LIMIT 1
            ) n
            WHERE {history_scope}
              {update_filter}
        """)

        # DELETE: latest history row per id, no main row left.
        delete_filter = _date_filter(from_ts, to_ts, params, col="upper(h.sys_period)")
        branches.append(f"""
            SELECT
                '{table}'::text                    AS entity_type,
                'delete'::text                     AS change_type,
                h.id                               AS id,
                to_jsonb(h.*)->>'update_type'      AS update_type,
                upper(h.sys_period)                AS ts,
                NULL::jsonb                        AS new_row,
                to_jsonb(h.*)                      AS old_row
            FROM {table}_history h
            WHERE {history_scope}
              {delete_filter}
              AND NOT EXISTS (
                  SELECT 1 FROM {table} t WHERE t.id = h.id
              )
              AND upper(h.sys_period) = (
                  SELECT max(upper(h2.sys_period))
                  FROM {table}_history h2
                  WHERE h2.id = h.id
              )
        """)

    return "\nUNION ALL\n".join(branches)


def _wrap_with_event_sources(
    union_sql: str,
    has_audit_log: bool,
    from_ts: datetime.datetime | None,
    to_ts: datetime.datetime | None,
    params: dict[str, Any],
) -> str:
    """Wrap per-table branches with audit_log join and action events.

    Exact-timestamp matching on the LEFT JOIN works because ``record_audit_entry()``
    and the temporal trigger both call ``now()`` inside the same transaction.
    Services without audit_log get NULL projections so the result schema stays uniform.
    """
    if has_audit_log:
        # audit_log.change_type wins over the _history heuristic — it's the explicit
        # writer intent. Needed for soft-deletes (is_deleted=true keeps the row in the
        # main table, so the DELETE branch never fires); we also null new_row when
        # audit_log reclassifies to delete to keep the change_type='delete' contract.
        diff_events_sql = f"""
            SELECT
                events.entity_type,
                COALESCE(al.change_type, events.change_type) AS change_type,
                events.id,
                events.update_type,
                COALESCE(al.request_start_time, events.ts) AS ts,
                CASE WHEN al.change_type = 'delete' THEN NULL ELSE events.new_row END
                    AS new_row,
                events.old_row,
                al.actor_user_id, al.triggered_by_user_id,
                al.workflow_run_id, al.workflow_type, al.action_type,
                al.request_id
            FROM (
                {union_sql}
            ) events
            LEFT JOIN audit_log al ON
                al.project_id = :project_id
                AND al.entity_id = events.id
                AND al.timestamp = events.ts
        """
        action_filter = _date_filter(from_ts, to_ts, params, col="al.timestamp")
        action_events_sql = f"""
            SELECT
                al.entity_type,
                'action'::text AS change_type,
                al.entity_id   AS id,
                NULL::text     AS update_type,
                COALESCE(al.request_start_time, al.timestamp) AS ts,
                NULL::jsonb    AS new_row,
                NULL::jsonb    AS old_row,
                al.actor_user_id, al.triggered_by_user_id,
                al.workflow_run_id, al.workflow_type, al.action_type,
                al.request_id
            FROM audit_log al
            WHERE al.project_id = :project_id
              AND al.change_type = 'action'
              {action_filter}
        """
        return f"{diff_events_sql}\nUNION ALL\n{action_events_sql}"
    return f"""
            SELECT
                events.entity_type, events.change_type, events.id,
                events.update_type, events.ts, events.new_row, events.old_row,
                NULL::uuid AS actor_user_id,
                NULL::uuid AS triggered_by_user_id,
                NULL::text AS workflow_run_id,
                NULL::text AS workflow_type,
                NULL::text AS action_type,
                NULL::text AS request_id
            FROM (
                {union_sql}
            ) events
        """


def _build_union_query(
    tables: list[str],
    project_id: uuid.UUID,
    from_ts: datetime.datetime | None,
    to_ts: datetime.datetime | None,
    oversample_limit: int,
    source_filter: str | None = None,
    has_audit_log: bool = False,
    collapsed: bool = False,
    workflow_run_id_filter: str | None = None,
    request_id_filter: str | None = None,
) -> tuple[str, dict[str, Any]]:
    """Build the full UNION ALL query for one Service-DB.

    ``COUNT(*) OVER ()`` runs after source/drill-down filters so ``total`` is post-filter.
    """
    params: dict[str, Any] = {"project_id": str(project_id), "lim": oversample_limit}
    union_sql = _build_table_branches(tables, from_ts, to_ts, params)
    inner_sql = _wrap_with_event_sources(union_sql, has_audit_log, from_ts, to_ts, params)

    # source/drill-down filters apply before the collapsing window
    pre_agg_predicates: list[str] = []
    source_predicate = _source_filter_predicate(source_filter)
    if source_predicate:
        pre_agg_predicates.append(source_predicate)
    if workflow_run_id_filter:
        params["workflow_run_id"] = workflow_run_id_filter
        pre_agg_predicates.append("workflow_run_id = :workflow_run_id")
    if request_id_filter:
        params["request_id"] = request_id_filter
        pre_agg_predicates.append("request_id = :request_id")
    if from_ts is not None and to_ts is not None:
        pre_agg_predicates.append("ts BETWEEN :from_ts AND :to_ts")
    elif from_ts is not None:
        pre_agg_predicates.append("ts >= :from_ts")
    elif to_ts is not None:
        pre_agg_predicates.append("ts <= :to_ts")
    pre_filter_clause = f"WHERE {' AND '.join(pre_agg_predicates)}" if pre_agg_predicates else ""

    if collapsed:
        sql = f"""
            SELECT *, COUNT(*) OVER () AS total_count
            FROM (
                SELECT * FROM (
                    SELECT
                        tagged.*,
                        ROW_NUMBER() OVER (
                            PARTITION BY group_key ORDER BY ts ASC
                        ) AS rn,
                        COUNT(*) OVER (PARTITION BY group_key)::int AS group_count
                    FROM (
                        SELECT
                            filtered.*,
                            CASE
                                WHEN filtered.workflow_run_id IS NOT NULL
                                THEN 'wf:' || filtered.workflow_run_id
                                WHEN filtered.request_id IS NOT NULL
                                THEN 'req:' || filtered.request_id
                                ELSE 'singleton:'
                                     || COALESCE(filtered.id::text, 'noid')
                                     || ':' || filtered.ts::text
                            END AS group_key
                        FROM (
                            {inner_sql}
                        ) filtered
                        {pre_filter_clause}
                    ) tagged
                ) windowed
                WHERE rn = 1
            ) collapsed_events
            ORDER BY collapsed_events.ts DESC NULLS LAST
            LIMIT :lim
        """
    else:
        sql = f"""
            SELECT *, 1::int AS group_count, COUNT(*) OVER () AS total_count
            FROM (
                SELECT * FROM (
                    {inner_sql}
                ) raw_events
                {pre_filter_clause}
            ) all_events
            ORDER BY all_events.ts DESC NULLS LAST
            LIMIT :lim
        """
    return sql, params
