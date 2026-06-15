"""Temporal sub-workflow that ingests Drucksachen for one source config."""

from begruendungen_db.workflows.update_begruendungen_source.workflow import (
    UpdateBegruendungenSourceWorkflow,
)

__all__ = ["UpdateBegruendungenSourceWorkflow"]
