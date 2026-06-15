"""Temporal workflow + activities that ingest court decisions into the database."""

from jura_db.workflows.update_rechtsprechung.activities import (
    UpdateRechtsprechungActivities,
)
from jura_db.workflows.update_rechtsprechung.workflow import UpdateRechtsprechungWorkflow

__all__ = [
    "UpdateRechtsprechungActivities",
    "UpdateRechtsprechungWorkflow",
]
