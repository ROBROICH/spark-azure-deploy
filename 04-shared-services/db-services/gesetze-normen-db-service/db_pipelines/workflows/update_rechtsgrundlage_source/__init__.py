"""Temporal sub-workflow that ingests one parser-block (EU, Bund, or a Bundesland)."""

from db_pipelines.workflows.update_rechtsgrundlage_source.workflow import (
    UpdateRechtsgrundlageSourceWorkflow,
)

__all__ = [
    "UpdateRechtsgrundlageSourceWorkflow",
]
