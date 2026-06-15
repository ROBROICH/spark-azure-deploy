"""Temporal workflow + activities that ingest the configured laws into the database."""

from db_pipelines.workflows.update_rechtsgrundlage.activities import UpdateRechtsgrundlageActivities
from db_pipelines.workflows.update_rechtsgrundlage.workflow import UpdateRechtsgrundlageWorkflow

__all__ = [
    "UpdateRechtsgrundlageActivities",
    "UpdateRechtsgrundlageWorkflow",
]
