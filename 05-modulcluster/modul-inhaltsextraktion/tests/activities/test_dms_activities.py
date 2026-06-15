# tests/activities/test_dms_activities.py
"""Tests for DMS activity functions."""

from typing import Any
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from src.activities.dms_activities import DmsFileInfo, _resolve_priority_file


def _make_file_info(filename: str) -> DmsFileInfo:
    """Create a DmsFileInfo instance with the given filename."""
    return DmsFileInfo(
        file_id=str(uuid4()),
        filename=filename,
        mime_type="application/pdf",
        bucket_path=f"projects/test/{filename}",
    )


@pytest.mark.asyncio
class TestResolvePriorityFile:
    """Tests for the _resolve_priority_file activity."""

    @patch("src.activities.dms_activities.download_file")
    async def test_returns_largest_file(self, mock_download: AsyncMock) -> None:
        """Test that the largest file by byte size is returned as priority."""
        small = _make_file_info("Erlaeuterungsbericht_kurz.pdf")
        large = _make_file_info("Erlaeuterungsbericht.pdf")

        async def side_effect(file_id: Any) -> bytes:
            """Return different byte sizes based on file_id."""
            if str(file_id) == small.file_id:
                return b"x" * 100
            return b"x" * 5000

        mock_download.side_effect = side_effect

        result = await _resolve_priority_file([small, large])

        assert result.file_id == large.file_id
        assert mock_download.call_count == 2

    @patch("src.activities.dms_activities.download_file")
    async def test_single_candidate(self, mock_download: AsyncMock) -> None:
        """Test that a single candidate is returned directly."""
        only = _make_file_info("Erlaeuterungsbericht.pdf")
        mock_download.return_value = b"x" * 1000

        result = await _resolve_priority_file([only])

        assert result.file_id == only.file_id

    @patch("src.activities.dms_activities.download_file")
    async def test_three_candidates_returns_largest(self, mock_download: AsyncMock) -> None:
        """Test that the largest of three candidates is returned."""
        a = _make_file_info("Erlaeuterungsbericht_A.pdf")
        b = _make_file_info("Erlaeuterungsbericht_B.pdf")
        c = _make_file_info("Erlaeuterungsbericht_C.pdf")

        sizes = {a.file_id: 200, b.file_id: 9000, c.file_id: 500}

        async def side_effect(file_id: Any) -> bytes:
            """Return byte content sized according to the sizes dict."""
            return b"x" * sizes[str(file_id)]

        mock_download.side_effect = side_effect

        result = await _resolve_priority_file([a, b, c])

        assert result.file_id == b.file_id
        assert mock_download.call_count == 3
