"""Temporal workflow + activities that ingest Gesetzesbegründungen into the database."""

from begruendungen_db.workflows.update_begruendungen.activities import UpdateBegruendungenActivities
from begruendungen_db.workflows.update_begruendungen.workflow import UpdateBegruendungenWorkflow

__all__ = [
    "UpdateBegruendungenActivities",
    "UpdateBegruendungenWorkflow",
]
