"""Aggregated Temporal workflows + activities for the rechtsaenderungs-monitoring worker."""

from collections.abc import Callable
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from rechtsaenderungsmonitoring.workflows.monitor_rechtsaenderungen import (
    MonitorRechtsaenderungenActivities,
    MonitorRechtsaenderungenWorkflow,
)
from rechtsaenderungsmonitoring.workflows.monitor_rechtsaenderungen_source import (
    MonitorRechtsaenderungenSourceWorkflow,
)

workflows: list[type[Any]] = [
    MonitorRechtsaenderungenWorkflow,
    MonitorRechtsaenderungenSourceWorkflow,
]


def make_activities(
    sessionmaker: async_sessionmaker[AsyncSession],
) -> list[Callable[..., Any]]:
    """Build the full activity list, injecting the database session factory."""
    activities = MonitorRechtsaenderungenActivities(sessionmaker)
    return [
        *activities.activity_fns,
    ]


__all__ = ["make_activities", "workflows"]
