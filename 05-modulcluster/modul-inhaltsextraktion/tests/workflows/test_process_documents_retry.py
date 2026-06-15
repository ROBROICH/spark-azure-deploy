"""Tests for ProcessDocumentsWorkflow helpers and edge cases."""

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from temporal.workflows.inhaltsextraktion.types import ProcessDocumentsWorkflowInput
from temporalio.exceptions import ApplicationError

from src.activities.dms_activities import DmsFileInfo
from src.config import Config
from src.workflows.process_documents_workflow import (
    ProcessDocumentsWorkflow,
    has_keyword_match,
)


def _file_info(name: str = "doc.pdf") -> DmsFileInfo:
    """Create a minimal DmsFileInfo for testing."""
    return DmsFileInfo(
        file_id=str(uuid4())[:8],
        filename=name,
        mime_type="application/pdf",
        bucket_path="bucket/path",
    )


class TestHasKeywordMatch:
    """Tests for keyword matching helper."""

    def test_match_found(self) -> None:
        """Test that a keyword match is found in the filename."""
        fi = _file_info("Planfeststellungsbeschluss.pdf")
        assert has_keyword_match(["Planfeststellungsbeschluss"], fi)

    def test_case_insensitive(self) -> None:
        """Test that keyword matching is case-insensitive."""
        fi = _file_info("ERLAEUTERUNGSBERICHT.pdf")
        assert has_keyword_match(["erlaeuterungsbericht"], fi)

    def test_no_match(self) -> None:
        """Test that no match returns False for unrelated filenames."""
        fi = _file_info("regular_doc.pdf")
        assert not has_keyword_match(["PFB"], fi)

    def test_unicode_normalization(self) -> None:
        """Test that Unicode-normalized filenames still match keywords."""
        fi = _file_info("Erläuterungsbericht.pdf")
        assert has_keyword_match(["erläuterungsbericht"], fi)

    def test_mojibake_ascii_fallback(self) -> None:
        """Corrupted Unicode (mojibake) should still match via ASCII fallback."""
        fi = _file_info("Erla\u2560\u00eauterungsbericht.pdf")  # ╠ê instead of ä
        assert has_keyword_match(["Erläuterungsbericht"], fi)


# ---------------------------------------------------------------------------
# Helpers for workflow tests
# ---------------------------------------------------------------------------

_MOD = "src.workflows.process_documents_workflow"


def _cfg(**overrides: Any) -> Config:
    """Build a Config with test defaults."""
    defaults = {
        "SKIP_DOCUMENTS_BY_KEYWORDS": False,
        "ALLOWED_EXTENSIONS": (".pdf",),
        "METADATA_PRIORITY_KEYWORDS": (),
    }
    defaults.update(overrides)
    return Config(**defaults)


def _make_workflow_patches(cfg: Config) -> Any:
    """Create a mock workflow module with standard stubs."""
    mock_wf = MagicMock()
    mock_wf.now.return_value = MagicMock()
    mock_wf.now.return_value.__sub__ = MagicMock(return_value=MagicMock(total_seconds=MagicMock(return_value=1.0)))
    mock_wf.info.return_value = MagicMock(workflow_id="test-wf-id")
    mock_wf.sleep = AsyncMock()
    mock_wf.execute_child_workflow = AsyncMock()
    return mock_wf


# ---------------------------------------------------------------------------
# Zero-results guard
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestAllDocumentsFailed:
    """Tests for the AllDocumentsFailed error guard in ProcessDocumentsWorkflow."""

    async def test_single_doc_all_fail_raises(self) -> None:
        """1 doc fails on every retry → workflow must raise AllDocumentsFailed."""
        cfg = _cfg()
        files = [_file_info("only_doc.pdf")]
        file_ids = [uuid4()]

        mock_wf = _make_workflow_patches(cfg)
        mock_get_meta = AsyncMock(side_effect=files)

        with (
            patch(f"{_MOD}.workflow", mock_wf),
            patch(f"{_MOD}.snapshot_config", return_value=cfg),
            patch(f"{_MOD}.ENV") as mock_env,
            patch(f"{_MOD}.dms_get_file_metadata", mock_get_meta),
            patch(f"{_MOD}.sliding_window") as mock_sw,
        ):
            mock_env.SINGLE_DOCUMENT_WORKFLOW_CONCURRENCY = 2

            # First call: doc fails. Second call (retry): doc succeeds → exits while loop.
            # But results is still empty because all "ok" results from sliding_window are empty.
            # Actually we need to simulate the while loop breaking: first call fails,
            # second call returns empty failed list (doc just vanishes — edge case).
            mock_sw.side_effect = [
                ([], files),   # initial: all fail
                ([], []),      # retry: nothing left (doc dropped)
            ]

            wf = ProcessDocumentsWorkflow()
            inp = ProcessDocumentsWorkflowInput(
                file_ids=file_ids,
                project_id=uuid4(),
            )

            with pytest.raises(ApplicationError, match="AllDocumentsFailed"):
                await wf.run(inp)
