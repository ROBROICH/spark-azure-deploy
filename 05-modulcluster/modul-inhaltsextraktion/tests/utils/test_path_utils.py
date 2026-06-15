# tests/utils/test_path_utils.py
"""Tests for path utility functions."""

from src.utils.path_utils import get_output_dir


class TestGetOutputDir:
    """Tests for get_output_dir function."""

    def test_simple_filename(self) -> None:
        """Tests with a simple filename without path."""
        result = get_output_dir("sicherheitsstudie.pdf")
        assert result == "sicherheitsstudie"

    def test_filename_with_path(self) -> None:
        """Tests with filename that has path prefix."""
        result = get_output_dir("files/data/erläuterungsbericht.pdf")
        assert result == "files/data/erläuterungsbericht"

    def test_single_directory(self) -> None:
        """Tests with single directory prefix."""
        result = get_output_dir("documents/report.pdf")
        assert result == "documents/report"

    def test_nested_directories(self) -> None:
        """Tests with multiple nested directories."""
        result = get_output_dir("level1/level2/level3/document.pdf")
        assert result == "level1/level2/level3/document"

    def test_different_extension(self) -> None:
        """Tests with different file extension."""
        result = get_output_dir("docs/readme.md")
        assert result == "docs/readme"

    def test_no_extension(self) -> None:
        """Tests filename without extension."""
        result = get_output_dir("Makefile")
        assert result == "Makefile"

    def test_multiple_dots_in_filename(self) -> None:
        """Tests filename with multiple dots."""
        result = get_output_dir("docs/file.backup.pdf")
        assert result == "docs/file.backup"

    def test_german_umlauts(self) -> None:
        """Tests filename with German umlauts."""
        result = get_output_dir("Übersicht_Antragsunterlagen.pdf")
        assert result == "Übersicht_Antragsunterlagen"

    def test_path_with_umlauts(self) -> None:
        """Tests path and filename with umlauts."""
        result = get_output_dir("Antragsdokumente/Erläuterung.pdf")
        assert result == "Antragsdokumente/Erläuterung"
