from collections.abc import Awaitable, Callable
from typing import Any
from unittest.mock import MagicMock, patch

from db_pipelines.schemas.db import DocType
from db_pipelines.schemas.temporal import NormSpec
from db_pipelines.workflows.update_rechtsgrundlage_source.workflow import UpdateRechtsgrundlageSourceWorkflow
from temporal.contracts import GesetzeNormenSource, UpdateRechtsgrundlageSourceInput

SOURCE_INPUT = UpdateRechtsgrundlageSourceInput.model_validate(
    {
        "source": GesetzeNormenSource.BUND,
        "laws": {
            "parser": "XmlProcessor1",
            "base_url": "http://test",
            "gesetz": ["g1"],
            "verordnung": ["vo1"],
            "richtlinie": ["rl1"],
            "verwaltungsvorschrift": ["vv1"],
            "technische_norm": ["tn1"],
        },
    }
)


async def _scheduled_doctypes(patched: bool) -> tuple[list[DocType], MagicMock]:
    scheduled: list[NormSpec] = []

    async def record(items: list[NormSpec], fn: Callable[[NormSpec], Awaitable[Any]], concurrency: int) -> list[Any]:
        scheduled.extend(items)
        return []

    module = "db_pipelines.workflows.update_rechtsgrundlage_source.workflow"
    with patch(f"{module}.workflow") as mock_workflow, patch(f"{module}.sliding_window", record):
        mock_workflow.patched.return_value = patched
        await UpdateRechtsgrundlageSourceWorkflow().run(SOURCE_INPUT)
    return [spec.doctype for spec in scheduled], mock_workflow


async def test_unpatched_history_keeps_pre_verwaltungsvorschrift_doctypes() -> None:
    doctypes, mock_workflow = await _scheduled_doctypes(patched=False)

    mock_workflow.patched.assert_called_once_with("rechtsgrundlage-source-verwaltungsvorschriften")
    assert doctypes == [DocType.GESETZ, DocType.VERORDNUNG, DocType.RICHTLINIE]


async def test_patched_workflow_ingests_verwaltungsvorschriften_but_not_technische_normen() -> None:
    doctypes, _ = await _scheduled_doctypes(patched=True)

    assert doctypes == [DocType.GESETZ, DocType.VERORDNUNG, DocType.RICHTLINIE, DocType.VERWALTUNGSVORSCHRIFT]
