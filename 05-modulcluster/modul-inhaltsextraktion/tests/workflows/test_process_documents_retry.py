"""Tests for ProcessDocumentsWorkflow helpers."""

from uuid import uuid4

from src.activities.dms_activities import DmsFileInfo
from src.workflows.process_documents_workflow import has_keyword_match


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
