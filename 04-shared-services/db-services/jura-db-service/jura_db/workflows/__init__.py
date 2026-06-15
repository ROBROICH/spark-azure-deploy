"""Aggregated Temporal workflows + activities for the jura-db worker."""

from collections.abc import Callable
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from jura_db.workflows.update_rechtsprechung import (
    UpdateRechtsprechungActivities,
    UpdateRechtsprechungWorkflow,
)

workflows: list[type[Any]] = [
    UpdateRechtsprechungWorkflow,
]


def make_activities(
    sessionmaker: async_sessionmaker[AsyncSession],
) -> list[Callable[..., Any]]:
    """Build the full activity list, injecting the database session factory."""
    db_activities = UpdateRechtsprechungActivities(sessionmaker)
    return [
        *db_activities.activity_fns,
    ]


__all__ = ["make_activities", "workflows"]
