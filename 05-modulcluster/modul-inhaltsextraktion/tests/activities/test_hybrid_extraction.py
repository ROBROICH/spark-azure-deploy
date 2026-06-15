from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from temporalio.common import RetryPolicy

from src.activities.hybrid_extraction import (
    SplitPDFScannedInput,
    SplitPDFScannedOutput,
    _split_pdf_by_scan_status,
    split_pdf_by_scan_status,
)


@pytest.fixture
def mock_logger():
    """Patches the Temporal activity logger to prevent massive byte strings from printing to console."""
    with patch("src.activities.hybrid_extraction.activity.logger") as mock_log:
        yield mock_log


@pytest.mark.asyncio
@patch("src.activities.hybrid_extraction.pdfium")
async def test_split_pdf_empty_document(mock_pdfium, mock_logger):
    """Tests the activity's early return when a PDF has 0 pages."""

    # 1. Setup mock PDF to return length 0
    mock_src_pdf = MagicMock()
    mock_src_pdf.__len__.return_value = 0
    mock_pdfium.PdfDocument.return_value = mock_src_pdf

    # 2. Execute Activity
    input_data = SplitPDFScannedInput(file_bytes=b"empty_pdf_bytes")
    result = await _split_pdf_by_scan_status(input_data)

    # 3. Assertions
    assert isinstance(result, SplitPDFScannedOutput)
    assert result.pdf_chunks == []
    assert result.is_scanned == []
    assert result.page_offsets == []


@pytest.mark.asyncio
@patch("src.activities.hybrid_extraction.pdfium")
async def test_split_pdf_mixed_scan_status(mock_pdfium, mock_logger):
    """Tests grouping logic by simulating scanned and digital pages."""

    # 1. Setup mock source PDF with 4 pages
    mock_src_pdf = MagicMock()
    mock_src_pdf.__len__.return_value = 4

    # Simulate:
    # Page 0: Scanned (No text)
    # Page 1: Scanned (Short text < 10 chars)
    # Page 2: Digital (Long text)
    # Page 3: Scanned (None text)
    def mock_get_page(index):
        page = MagicMock()
        text_page = MagicMock()

        if index == 0:
            text_page.get_text_range.return_value = ""
        elif index == 1:
            text_page.get_text_range.return_value = "short"
        elif index == 2:
            text_page.get_text_range.return_value = "This is a natively digital page with plenty of text."
        elif index == 3:
            text_page.get_text_range.return_value = None

        page.get_textpage.return_value = text_page
        return page

    mock_src_pdf.__getitem__.side_effect = mock_get_page
    mock_pdfium.PdfDocument.return_value = mock_src_pdf

    # 2. Setup mock for creating new PDF chunks
    mock_new_pdf = MagicMock()
    mock_pdfium.PdfDocument.new.return_value = mock_new_pdf

    # When new_pdf.save(buffer) is called, write fake bytes to the io.BytesIO buffer
    def mock_save(buffer):
        buffer.write(b"fake_chunk_bytes")

    mock_new_pdf.save.side_effect = mock_save

    # 3. Execute Activity
    input_data = SplitPDFScannedInput(file_bytes=b"source_pdf_bytes")
    result = await _split_pdf_by_scan_status(input_data)

    # 4. Assertions
    # We expect 3 chunks: [P0, P1] (Scanned), [P2] (Digital), [P3] (Scanned)
    assert len(result.pdf_chunks) == 3
    assert result.pdf_chunks == [b"fake_chunk_bytes", b"fake_chunk_bytes", b"fake_chunk_bytes"]

    assert result.is_scanned == [True, False, True]
    assert result.page_offsets == [0, 2, 3]

    # Verify that the correct page indices were imported into the new PDFs
    assert mock_new_pdf.import_pages.call_count == 3
    mock_new_pdf.import_pages.assert_any_call(mock_src_pdf, [0, 1])
    mock_new_pdf.import_pages.assert_any_call(mock_src_pdf, [2])
    mock_new_pdf.import_pages.assert_any_call(mock_src_pdf, [3])


@pytest.mark.asyncio
@patch("src.activities.hybrid_extraction.get_config")
@patch("src.activities.hybrid_extraction.workflow.execute_activity", new_callable=AsyncMock)
async def test_workflow_wrapper(mock_execute_activity, mock_get_config):
    """Tests the workflow wrapper delegates to the activity correctly."""

    # 1. Setup config mock
    mock_config = MagicMock()
    mock_config.TEMPORAL_PREPROCESSING_ACTIVITY_MAX_ATTEMPTS = 5
    mock_get_config.return_value = mock_config

    # 2. Setup workflow mock return value
    expected_output = SplitPDFScannedOutput(pdf_chunks=[b"chunk_bytes"], is_scanned=[True], page_offsets=[0])
    mock_execute_activity.return_value = expected_output

    # 3. Execute Workflow wrapper
    test_bytes = b"test_source_bytes"
    result = await split_pdf_by_scan_status(test_bytes)

    # 4. Assertions
    assert result == expected_output

    mock_execute_activity.assert_called_once()
    args, kwargs = mock_execute_activity.call_args

    # Check that the correct activity and input were passed
    assert args[0] == _split_pdf_by_scan_status
    assert isinstance(args[1], SplitPDFScannedInput)
    assert args[1].file_bytes == test_bytes

    # Check workflow execution options
    assert kwargs["start_to_close_timeout"] == timedelta(minutes=10)
    assert isinstance(kwargs["retry_policy"], RetryPolicy)
    assert kwargs["retry_policy"].maximum_attempts == 5
