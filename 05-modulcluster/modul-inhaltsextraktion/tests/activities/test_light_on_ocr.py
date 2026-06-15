from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from temporalio.common import RetryPolicy

from src.activities.light_on_ocr.light_on_ocr import (
    PreparePDFPageImagesOutput,
    _prepare_pdf_page_images,
    extract_markdown,
    prepare_pdf_page_images,
    strip_artifacts,
)

# --- 1. Pure Function Tests ---


def test_strip_artifacts():
    """Tests the regex cleaning function against LaTeX tags and trailing notes."""

    # Test stripping basic LaTeX tags
    assert strip_artifacts(r"$\textbf{bold text}$") == "bold text"
    assert strip_artifacts(r"$\mathrm{math text}$") == "math text"

    # Test stripping unbracketed tags
    assert strip_artifacts(r"\lambda value") == "value"

    # Test stripping trailing model notes
    text_with_note = "Valid content here.\n\nNote: This is an AI-generated warning."
    assert strip_artifacts(text_with_note) == "Valid content here."

    # Test combined scenarios
    complex_text = r"$\textit{Hello}$ world" + "\n\nNote: fake note"
    assert strip_artifacts(complex_text) == "Hello world"


# --- 2. Activity Tests ---


@pytest.fixture
def mock_logger():
    """Patches the Temporal activity logger to prevent console noise."""
    with patch("src.activities.light_on_ocr.light_on_ocr.activity.logger") as mock_log:
        yield mock_log


@pytest.mark.asyncio
@patch("src.activities.light_on_ocr.light_on_ocr.pdfium.PdfDocument")
async def test_prepare_pdf_page_images_empty(mock_pdf_doc, mock_logger):
    """Tests that an empty PDF gracefully returns an empty list."""

    # Mock PDF length to 0
    mock_src_pdf = MagicMock()
    mock_src_pdf.__len__.return_value = 0
    mock_pdf_doc.return_value = mock_src_pdf

    result = await _prepare_pdf_page_images(b"fake_empty_bytes")

    assert isinstance(result, PreparePDFPageImagesOutput)
    assert result.page_images_b64 == []


@pytest.mark.asyncio
@patch("src.activities.light_on_ocr.light_on_ocr.get_config")
@patch("src.activities.light_on_ocr.light_on_ocr.pdfium.PdfDocument")
@patch("src.activities.light_on_ocr.light_on_ocr.PageImage")
@patch("src.activities.light_on_ocr.light_on_ocr.RotationDetector")
async def test_prepare_pdf_page_images_valid(
    mock_rotation_detector, mock_page_image, mock_pdf_doc, mock_get_config, mock_logger
):
    """Tests the rendering, rotation, and encoding of PDF pages."""

    # 1. Setup Mock Config
    mock_cfg = MagicMock()
    mock_cfg.OCR_ROTATION_THRESHOLD = 5.0
    mock_cfg.OCR_FLIP_THRESHOLD = 0.5
    mock_get_config.return_value = mock_cfg

    # 2. Setup Mock PDF with 1 page
    mock_page = MagicMock()

    # Mock PIL image behavior (when pil_image.save(buffer, format="PNG") is called)
    mock_pil_image = MagicMock()

    def mock_save(buffer, format):
        buffer.write(b"fake_png_bytes")

    mock_pil_image.save.side_effect = mock_save

    # Chain the page rendering mock
    mock_page.render.return_value.to_pil.return_value = mock_pil_image

    mock_src_pdf = MagicMock()
    mock_src_pdf.__len__.return_value = 1
    mock_src_pdf.__iter__.return_value = iter([mock_page])
    mock_pdf_doc.return_value = mock_src_pdf

    # 3. Setup Mock PageImage and RotationDetector
    mock_img_instance = MagicMock()
    mock_img_instance.to_light_on_ocr_b64.return_value = "b64_rotated_string"
    mock_page_image.return_value = mock_img_instance

    mock_rotation_instance = MagicMock()
    mock_rotation_instance.detect.return_value.angle = 90
    mock_rotation_detector.return_value = mock_rotation_instance

    # 4. Execute Activity
    result = await _prepare_pdf_page_images(b"fake_pdf_bytes")

    # 5. Assertions
    assert isinstance(result, PreparePDFPageImagesOutput)
    assert result.page_images_b64 == ["b64_rotated_string"]

    # Verify image rotation was called with detected angle
    mock_img_instance.rotate.assert_called_once_with(degrees=90)


# --- 3. Workflow Wrapper & VLM Extractor Tests ---


@pytest.mark.asyncio
@patch("src.activities.light_on_ocr.light_on_ocr.get_config")
@patch("src.activities.light_on_ocr.light_on_ocr.workflow.execute_activity", new_callable=AsyncMock)
async def test_prepare_pdf_page_images_workflow(mock_execute_activity, mock_get_config):
    """Tests the workflow wrapper delegates to the activity correctly."""

    mock_cfg = MagicMock()
    mock_cfg.TEMPORAL_PREPROCESSING_ACTIVITY_MAX_ATTEMPTS = 3
    mock_get_config.return_value = mock_cfg

    expected_output = PreparePDFPageImagesOutput(page_images_b64=["base64_str"])
    mock_execute_activity.return_value = expected_output

    result = await prepare_pdf_page_images(b"raw_bytes")

    assert result == expected_output
    mock_execute_activity.assert_called_once()

    # Verify kwargs like timeout and retry policy
    args, kwargs = mock_execute_activity.call_args
    assert args[0] == _prepare_pdf_page_images
    assert args[1] == b"raw_bytes"
    assert kwargs["start_to_close_timeout"] == timedelta(minutes=10)
    assert isinstance(kwargs["retry_policy"], RetryPolicy)


@pytest.mark.asyncio
@patch("src.activities.light_on_ocr.light_on_ocr.get_config")
@patch("src.activities.light_on_ocr.light_on_ocr.vlm_invoke", new_callable=AsyncMock)
async def test_extract_markdown(mock_vlm_invoke, mock_get_config):
    """Tests the VLM invocation and subsequent artifact stripping."""

    # Setup config
    mock_cfg = MagicMock()
    mock_cfg.LIGHT_ON_OCR_MODEL = "test-model"
    mock_get_config.return_value = mock_cfg

    # Mock VLM output to contain LaTeX that needs stripping
    mock_vlm_invoke.return_value = r"Extracted $\textbf{bold text}$ here."

    # Execute
    result = await extract_markdown("fake_base64_image")

    # Assert VLM was called
    mock_vlm_invoke.assert_called_once()

    # Assert strip_artifacts cleaned the output before returning
    assert result == "Extracted bold text here."
