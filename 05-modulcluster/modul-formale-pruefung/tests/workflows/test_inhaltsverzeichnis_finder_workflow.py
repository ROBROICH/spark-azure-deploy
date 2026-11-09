import asyncio
from unittest.mock import patch

import pytest

from src.schemas.inhaltsverzeichnis_finder_schemas import InhaltsverzeichnisEntry
from src.workflows.inhaltsverzeichnis_finder import (
    MAX_DOCUMENT_TYPE_NAME_LENGTH,
    InhaltsverzeichnisFinderWorkflow,
)

from .mock_activities import llm_document_type_description_generation

WORKFLOW_MODULE = "src.workflows.inhaltsverzeichnis_finder"


async def _gather(items, fn, concurrency):
    return await asyncio.gather(*(fn(item) for item in items))


@pytest.mark.asyncio
async def test_caps_overlong_entry_title_to_name_budget():
    """An LLM that merges many TOC lines into one title must not break the backend name budget."""
    merged_title = " ".join(f"Plan Blatt {sheet}f Abschnitt {sheet} Deckblatt" for sheet in range(1, 80))
    entries = [
        InhaltsverzeichnisEntry(entry_title=merged_title, hierarchy_path=["Verzeichnis"], entry_number="1"),
        InhaltsverzeichnisEntry(entry_title="Erläuterungsbericht", hierarchy_path=[], entry_number="2"),
    ]

    with (
        patch(f"{WORKFLOW_MODULE}.sliding_window", _gather),
        patch(f"{WORKFLOW_MODULE}.llm_document_type_description_generation", llm_document_type_description_generation),
    ):
        document_types = await InhaltsverzeichnisFinderWorkflow()._llm_document_type_description_generation(
            inhaltsverzeichnis_entries=entries,
            reference_document_types=[],
        )

    assert len(merged_title) > MAX_DOCUMENT_TYPE_NAME_LENGTH
    assert document_types[0].document_type_name == merged_title[:MAX_DOCUMENT_TYPE_NAME_LENGTH]
    assert document_types[1].document_type_name == "Erläuterungsbericht"
