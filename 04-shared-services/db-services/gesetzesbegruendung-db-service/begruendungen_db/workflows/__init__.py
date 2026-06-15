"""Aggregated Temporal workflows + activities for the begruendungen-db worker."""

from collections.abc import Callable
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from begruendungen_db.workflows.update_begruendungen import (
    UpdateBegruendungenActivities,
    UpdateBegruendungenWorkflow,
)
from begruendungen_db.workflows.update_begruendungen_source import (
    UpdateBegruendungenSourceWorkflow,
)
from begruendungen_db.workflows.update_begruendungen_law_doc import (
    UpdateBegruendungenLawDocWorkflow,
)

workflows: list[type[Any]] = [
    UpdateBegruendungenWorkflow,
    UpdateBegruendungenSourceWorkflow,
    UpdateBegruendungenLawDocWorkflow,
]


def make_activities(
    sessionmaker: async_sessionmaker[AsyncSession],
) -> list[Callable[..., Any]]:
    """Build the full activity list, injecting the database session factory."""
    db_activities = UpdateBegruendungenActivities(sessionmaker)
    return [*db_activities.activity_fns]


__all__ = ["make_activities", "workflows"]
