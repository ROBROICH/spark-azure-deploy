"""Read-only aggregator over service _history tables."""

from __future__ import annotations

import asyncio

from src.models.schemas.protocol_schemas import HistoryItem
from src.services.history.query import HistoryQuery
from src.services.history.query_builder import HISTORY_SOURCES
from src.services.history.repository import _fetch_for_db


async def fetch_history(query: HistoryQuery) -> tuple[list[HistoryItem], int]:
    """Fetch aggregated history across all configured Service-DBs.

    Uses TaskGroup so a single failing DB cancels siblings rather than silently
    undercounting total. Cross-DB group merging is finalized in Python after SQL
    per-DB pre-aggregation.
    """
    db_tables: dict[str, list[str]] = {}
    for db_key, table in HISTORY_SOURCES:
        if query.service and db_key != query.service:
            continue
        db_tables.setdefault(db_key, []).append(table)

    if not db_tables:
        return [], 0

    async with asyncio.TaskGroup() as tg:
        tasks = [tg.create_task(_fetch_for_db(db_key, tables, query)) for db_key, tables in db_tables.items()]
    results: list[tuple[list[HistoryItem], int]] = [t.result() for t in tasks]

    all_items: list[HistoryItem] = []
    total = 0
    for items, db_total in results:
        all_items.extend(items)
        total += db_total

    # total may overcount when a workflow/request spans multiple DBs and gets merged
    # below — acceptable because the UI uses it only for display, not pagination math.
    if query.collapsed:
        all_items = _merge_groups_across_dbs(all_items)

    all_items.sort(key=lambda i: i.timestamp, reverse=True)
    return all_items[query.offset : query.offset + query.limit], total


def _merge_groups_across_dbs(items: list[HistoryItem]) -> list[HistoryItem]:
    """Merge per-DB group representatives for workflows/requests that span multiple DBs.

    Each DB already collapsed its own events; here we fold cross-DB duplicates into
    one item (earliest timestamp wins, group_count summed). Singletons pass through.
    """
    by_group_key: dict[str, list[HistoryItem]] = {}
    singletons: list[HistoryItem] = []
    for item in items:
        if item.workflow_run_id:
            by_group_key.setdefault(f"wf:{item.workflow_run_id}", []).append(item)
        elif item.request_id:
            by_group_key.setdefault(f"req:{item.request_id}", []).append(item)
        else:
            singletons.append(item)

    merged: list[HistoryItem] = []
    for group_items in by_group_key.values():
        if len(group_items) == 1:
            merged.append(group_items[0])
            continue
        group_items.sort(key=lambda i: i.timestamp)
        rep = group_items[0]
        merged.append(
            rep.model_copy(
                update={
                    "group_count": sum(i.group_count for i in group_items),
                }
            )
        )

    return merged + singletons
