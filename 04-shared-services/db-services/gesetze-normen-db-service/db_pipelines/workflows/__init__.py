"""Aggregated Temporal workflows + activities for the gesetze-normen worker."""

from collections.abc import Callable
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from db_pipelines.workflows.update_rechtsgrundlage import (
    UpdateRechtsgrundlageActivities,
    UpdateRechtsgrundlageWorkflow,
)
from db_pipelines.workflows.update_rechtsgrundlage_source import (
    UpdateRechtsgrundlageSourceWorkflow,
)

workflows: list[type[Any]] = [
    UpdateRechtsgrundlageWorkflow,
    UpdateRechtsgrundlageSourceWorkflow,
]


def make_activities(
    sessionmaker: async_sessionmaker[AsyncSession],
) -> list[Callable[..., Any]]:
    """Build the full activity list, injecting the database session factory."""
    db_activities = UpdateRechtsgrundlageActivities(sessionmaker)
    return [
        *db_activities.activity_fns,
    ]


__all__ = ["make_activities", "workflows"]
