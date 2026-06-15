"""Unit tests for history.query_builder — SQL generation and source filtering."""

from __future__ import annotations

import datetime
import uuid
from typing import Any

import pytest

from src.services.history.query_builder import (
    ALLOWED_TABLES,
    HISTORY_SOURCES,
    _build_union_query,
    _date_filter,
    _source_filter_predicate,
    classify_source,
)

PROJECT_ID = uuid.UUID("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")


def test_date_filter_no_dates() -> None:
    params: dict[str, Any] = {}
    result = _date_filter(None, None, params, col="lower(t.sys_period)")
    assert result == ""
    assert params == {}


def test_date_filter_both() -> None:
    params: dict[str, Any] = {}
    from_ts = datetime.datetime(2025, 1, 1)
    to_ts = datetime.datetime(2025, 12, 31)
    result = _date_filter(from_ts, to_ts, params, col="lower(t.sys_period)")
    assert "BETWEEN :from_ts AND :to_ts" in result
    assert "lower(t.sys_period)" in result
    assert params["from_ts"] == from_ts
    assert params["to_ts"] == to_ts


def test_date_filter_only_from() -> None:
    params: dict[str, Any] = {}
    from_ts = datetime.datetime(2025, 6, 1)
    result = _date_filter(from_ts, None, params, col="lower(h.sys_period)")
    assert ">= :from_ts" in result
    assert "from_ts" in params
    assert "to_ts" not in params


def test_date_filter_only_to() -> None:
    params: dict[str, Any] = {}
    to_ts = datetime.datetime(2025, 12, 31)
    result = _date_filter(None, to_ts, params, col="upper(h.sys_period)")
    assert "<= :to_ts" in result
    assert "to_ts" in params
    assert "from_ts" not in params


def test_date_filter_uses_provided_col() -> None:
    params: dict[str, Any] = {}
    result = _date_filter(None, datetime.datetime(2025, 1, 1), params, col="upper(h.sys_period)")
    assert "upper(h.sys_period)" in result


def test_build_union_query_contains_all_branches() -> None:
    sql, params = _build_union_query(["applicant"], PROJECT_ID, None, None, oversample_limit=50)
    assert "'create'" in sql
    assert "'update'" in sql
    assert "'delete'" in sql
    assert "applicant_history" in sql
    assert "CROSS JOIN LATERAL" in sql
    assert "NOT EXISTS" in sql
    assert "COUNT(*) OVER ()" in sql
    assert "LIMIT :lim" in sql
    assert params["project_id"] == str(PROJECT_ID)
    assert params["lim"] == 50


def test_build_union_query_multiple_tables() -> None:
    sql, _params = _build_union_query(["category", "document"], PROJECT_ID, None, None, oversample_limit=100)
    # 4 branches × 2 tables = 8 selects at the top level, joined by 7
    # UNION ALLs. The UPDATE branch itself contains another inner UNION
    # ALL inside a LATERAL subquery, so the raw count is higher.
    assert sql.count("'create'::text") == 4  # 2 tables × (CREATE-A + CREATE-B)
    assert sql.count("'update'::text") == 2
    assert sql.count("'delete'::text") == 2
    assert "'category'" in sql
    assert "'document'" in sql


def test_build_union_query_with_date_filter() -> None:
    from_ts = datetime.datetime(2025, 1, 1, tzinfo=datetime.UTC)
    to_ts = datetime.datetime(2025, 12, 31, tzinfo=datetime.UTC)
    sql, params = _build_union_query(["project"], PROJECT_ID, from_ts, to_ts, oversample_limit=50)
    assert "BETWEEN :from_ts AND :to_ts" in sql
    assert params["from_ts"] == from_ts
    assert params["to_ts"] == to_ts


def test_build_union_query_create_uses_lower_sys_period() -> None:
    sql, _ = _build_union_query(["applicant"], PROJECT_ID, None, None, oversample_limit=50)
    # CREATE-A keys on lower(t.sys_period); CREATE-B keys on lower(h.sys_period).
    assert "lower(t.sys_period)" in sql
    assert "lower(h.sys_period)" in sql


def test_build_union_query_update_uses_upper_sys_period_as_ts() -> None:
    sql, _ = _build_union_query(["applicant"], PROJECT_ID, None, None, oversample_limit=50)
    # UPDATE event timestamp must be when the version ended (upper),
    # not when it started (lower) — that's when the update actually happened.
    assert "upper(h.sys_period)                AS ts" in sql


def test_build_union_query_delete_uses_upper_sys_period() -> None:
    sql, _ = _build_union_query(["applicant"], PROJECT_ID, None, None, oversample_limit=50)
    assert "upper(h.sys_period)" in sql


def test_build_union_query_project_table_scopes_by_id() -> None:
    # The `project` root table stores NULL in project_id (the column is
    # overridden to nullable on Project). Scope the query by id instead.
    sql, _ = _build_union_query(["project"], PROJECT_ID, None, None, oversample_limit=50)
    assert "t.id = :project_id" in sql
    assert "h.id = :project_id" in sql
    assert "t.project_id = :project_id" not in sql
    assert "h.project_id = :project_id" not in sql


def test_build_union_query_non_project_table_scopes_by_project_id() -> None:
    sql, _ = _build_union_query(["applicant"], PROJECT_ID, None, None, oversample_limit=50)
    assert "t.project_id = :project_id" in sql
    assert "h.project_id = :project_id" in sql


def test_build_union_query_update_has_no_inner_join_on_main() -> None:
    # A plain JOIN on the main table would silently drop updates for
    # entities that were later deleted. LATERAL with a UNION over the
    # next history row OR the main row covers both cases.
    sql, _ = _build_union_query(["applicant"], PROJECT_ID, None, None, oversample_limit=50)
    assert "CROSS JOIN LATERAL" in sql
    # The LATERAL subquery yields the state matching the next version's
    # lower(sys_period), so new_row is the post-update snapshot, not the
    # always-current main row.
    assert "lower(h2.sys_period) = upper(h.sys_period)" in sql
    assert "lower(t.sys_period) = upper(h.sys_period)" in sql


def test_build_union_query_create_b_picks_earliest_history_row() -> None:
    sql, _ = _build_union_query(["applicant"], PROJECT_ID, None, None, oversample_limit=50)
    # CREATE-B reconstructs the original state of an updated entity from
    # the earliest history row for that id.
    assert "min(lower(h2.sys_period))" in sql


def test_build_union_query_create_a_excludes_rows_with_history() -> None:
    sql, _ = _build_union_query(["applicant"], PROJECT_ID, None, None, oversample_limit=50)
    # CREATE-A must exclude rows that have history, otherwise its
    # timestamp (lower(main.sys_period)) would be the last-update time,
    # not the create time, and it would duplicate CREATE-B.
    assert "NOT EXISTS (\n                  SELECT 1 FROM applicant_history h WHERE h.id = t.id" in sql


def test_build_union_query_delete_filters_to_latest_history_row() -> None:
    sql, _ = _build_union_query(["project"], PROJECT_ID, None, None, oversample_limit=50)
    # Delete branch must restrict to the latest history row per id, otherwise
    # an entity updated N times before deletion produces N delete events.
    assert "max(upper(h2.sys_period))" in sql


def test_build_union_query_source_filter_user() -> None:
    sql, _ = _build_union_query(["project"], PROJECT_ID, None, None, oversample_limit=50, source_filter="user")
    assert "actor_user_id IS NOT NULL" in sql
    assert "upper(update_type)" not in sql


def test_build_union_query_source_filter_agent() -> None:
    sql, _ = _build_union_query(["project"], PROJECT_ID, None, None, oversample_limit=50, source_filter="agent")
    # Agent is the negation of the user predicate; both audit signals and
    # update_type fallback must appear inside the negated clause.
    assert "NOT (workflow_run_id IS NULL AND workflow_type IS NULL" in sql


def test_build_union_query_source_filter_all_omits_clause() -> None:
    sql, _ = _build_union_query(["project"], PROJECT_ID, None, None, oversample_limit=50, source_filter="all")
    assert "upper(update_type)" not in sql


def test_build_union_query_source_filter_none_omits_clause() -> None:
    sql, _ = _build_union_query(["project"], PROJECT_ID, None, None, oversample_limit=50, source_filter=None)
    assert "upper(update_type)" not in sql


_USER_PREDICATE = "(workflow_run_id IS NULL AND workflow_type IS NULL AND actor_user_id IS NOT NULL)"


def test_source_filter_predicate_user() -> None:
    assert _source_filter_predicate("user") == _USER_PREDICATE


def test_source_filter_predicate_agent() -> None:
    # Agent is exactly the negation of the user predicate.
    assert _source_filter_predicate("agent") == f"NOT {_USER_PREDICATE}"


def test_classify_source_matches_predicate_arms() -> None:
    """``classify_source`` and the SQL filter share ``_IS_USER`` — same verdict for every arm."""
    action_row: dict[str, Any] = {
        "update_type": None,
        "actor_user_id": "11111111-1111-1111-1111-111111111111",
        "triggered_by_user_id": None,
        "workflow_run_id": None,
        "workflow_type": None,
    }
    assert classify_source(action_row) == "user"

    workflow_row: dict[str, Any] = {
        "update_type": "AUTOMATED",
        "actor_user_id": None,
        "triggered_by_user_id": "22222222-2222-2222-2222-222222222222",
        "workflow_run_id": "wf-run-123",
        "workflow_type": "formal_completeness",
    }
    assert classify_source(workflow_row) == "agent"


def test_source_filter_predicate_all_returns_none() -> None:
    assert _source_filter_predicate("all") is None


def test_source_filter_predicate_none_returns_none() -> None:
    assert _source_filter_predicate(None) is None


def test_source_filter_predicate_unknown_raises() -> None:
    with pytest.raises(ValueError, match="Unknown source_filter"):
        _source_filter_predicate("bogus")


def test_allowed_tables_derived_from_history_sources() -> None:
    expected = frozenset(t for _, t in HISTORY_SOURCES)
    assert expected == ALLOWED_TABLES


def test_build_union_query_collapsed_emits_window_functions() -> None:
    sql, _params = _build_union_query(
        tables=["project"],
        project_id=PROJECT_ID,
        from_ts=None,
        to_ts=None,
        oversample_limit=10,
        has_audit_log=True,
        collapsed=True,
    )
    # Aggregations-Wrapper: ROW_NUMBER pro group_key, COUNT als group_count,
    # synthetischer group_key für Singletons (workflow_run_id IS NULL).
    assert "ROW_NUMBER() OVER" in sql
    assert "PARTITION BY group_key" in sql
    assert "AS group_count" in sql
    assert "WHEN filtered.workflow_run_id IS NOT NULL" in sql
    assert "WHERE rn = 1" in sql


def test_build_union_query_ungrouped_skips_aggregation() -> None:
    sql, _params = _build_union_query(
        tables=["project"],
        project_id=PROJECT_ID,
        from_ts=None,
        to_ts=None,
        oversample_limit=10,
        has_audit_log=True,
        collapsed=False,
    )
    # Ungrouped: kein Window-Wrapper, group_count konstant 1.
    assert "ROW_NUMBER() OVER" not in sql
    assert "1::int AS group_count" in sql


def test_build_union_query_workflow_run_id_filter_pushed_to_where() -> None:
    sql, params = _build_union_query(
        tables=["project"],
        project_id=PROJECT_ID,
        from_ts=None,
        to_ts=None,
        oversample_limit=10,
        has_audit_log=True,
        collapsed=False,
        workflow_run_id_filter="wf-test-abc",
    )
    assert "workflow_run_id = :workflow_run_id" in sql
    assert params["workflow_run_id"] == "wf-test-abc"


def test_build_union_query_audit_log_left_joins_diff_events() -> None:
    """LEFT JOIN auf audit_log über (project_id, entity_id, timestamp)."""
    sql, _params = _build_union_query(
        tables=["project"],
        project_id=PROJECT_ID,
        from_ts=None,
        to_ts=None,
        oversample_limit=10,
        has_audit_log=True,
        collapsed=False,
    )
    assert "LEFT JOIN audit_log al" in sql
    assert "al.project_id = :project_id" in sql
    assert "al.entity_id = events.id" in sql
    assert "al.timestamp = events.ts" in sql


def test_build_union_query_audit_log_change_type_wins_over_history_heuristic() -> None:
    """audit_log.change_type override per COALESCE — Soft-Delete-Override-Pfad."""
    sql, _params = _build_union_query(
        tables=["project"],
        project_id=PROJECT_ID,
        from_ts=None,
        to_ts=None,
        oversample_limit=10,
        has_audit_log=True,
        collapsed=False,
    )
    # Soft-Delete-Hauptcase: COALESCE(al.change_type, events.change_type)
    assert "COALESCE(al.change_type, events.change_type)" in sql
    # new_row wird auf NULL gesetzt wenn audit_log auf 'delete' reklassifiziert,
    # damit DELETE-Konvention (new_row=null) konsistent bleibt.
    assert "WHEN al.change_type = 'delete' THEN NULL ELSE events.new_row END" in sql


def test_build_union_query_audit_log_emits_action_branch() -> None:
    """Zweites UNION ALL für pure audit_log-Einträge (change_type='action')."""
    sql, _params = _build_union_query(
        tables=["project"],
        project_id=PROJECT_ID,
        from_ts=None,
        to_ts=None,
        oversample_limit=10,
        has_audit_log=True,
        collapsed=False,
    )
    # Pure action-Rows haben kein _history-Pendant — daher zweites UNION.
    assert "'action'::text AS change_type" in sql
    assert "al.change_type = 'action'" in sql
    # Action-Rows tragen kein new_row/old_row.
    assert "NULL::jsonb    AS new_row" in sql
    assert "NULL::jsonb    AS old_row" in sql


def test_build_union_query_audit_log_action_branch_passes_through_actor_fields() -> None:
    """Action-Branch projiziert die fünf Actor-/Workflow-Felder aus audit_log."""
    sql, _params = _build_union_query(
        tables=["project"],
        project_id=PROJECT_ID,
        from_ts=None,
        to_ts=None,
        oversample_limit=10,
        has_audit_log=True,
        collapsed=False,
    )
    # Action-Branch zieht alle audit-Felder aus al.* direkt
    action_block_marker = "al.change_type = 'action'"
    action_start = sql.index(action_block_marker)
    action_segment = sql[max(0, action_start - 800) : action_start]
    for field in (
        "al.actor_user_id",
        "al.triggered_by_user_id",
        "al.workflow_run_id",
        "al.workflow_type",
        "al.action_type",
    ):
        assert field in action_segment


def test_build_union_query_audit_log_date_filter_applies_to_action_branch() -> None:
    """Action-Branch nutzt al.timestamp im _date_filter — sonst würden actions
    ohne sys_period unbeschränkt durchkommen."""
    from_ts = datetime.datetime(2025, 1, 1, tzinfo=datetime.UTC)
    to_ts = datetime.datetime(2025, 12, 31, tzinfo=datetime.UTC)
    sql, params = _build_union_query(
        tables=["project"],
        project_id=PROJECT_ID,
        from_ts=from_ts,
        to_ts=to_ts,
        oversample_limit=10,
        has_audit_log=True,
        collapsed=False,
    )
    # _date_filter mit beiden Grenzen liefert BETWEEN; col-Argument für die
    # Action-Branch ist al.timestamp.
    assert "AND al.timestamp BETWEEN :from_ts AND :to_ts" in sql
    assert params.get("from_ts") == from_ts
    assert params.get("to_ts") == to_ts


def test_build_union_query_without_audit_log_skips_left_join() -> None:
    """Nicht-migrierte Services dürfen den audit_log JOIN nicht ausführen."""
    sql, _params = _build_union_query(
        tables=["project"],
        project_id=PROJECT_ID,
        from_ts=None,
        to_ts=None,
        oversample_limit=10,
        has_audit_log=False,
        collapsed=False,
    )
    assert "audit_log" not in sql
    assert "LEFT JOIN" not in sql


def test_build_union_query_without_audit_log_projects_null_actor_fields() -> None:
    """Result-Schema muss konsistent bleiben — actor/workflow Felder als NULL."""
    sql, _params = _build_union_query(
        tables=["project"],
        project_id=PROJECT_ID,
        from_ts=None,
        to_ts=None,
        oversample_limit=10,
        has_audit_log=False,
        collapsed=False,
    )
    assert "NULL::uuid AS actor_user_id" in sql
    assert "NULL::uuid AS triggered_by_user_id" in sql
    assert "NULL::text AS workflow_run_id" in sql
    assert "NULL::text AS workflow_type" in sql
    assert "NULL::text AS action_type" in sql


def test_build_union_query_without_audit_log_has_no_action_branch() -> None:
    """Pure action-Rows existieren nicht für Services ohne audit_log."""
    sql, _params = _build_union_query(
        tables=["project"],
        project_id=PROJECT_ID,
        from_ts=None,
        to_ts=None,
        oversample_limit=10,
        has_audit_log=False,
        collapsed=False,
    )
    assert "'action'::text AS change_type" not in sql
