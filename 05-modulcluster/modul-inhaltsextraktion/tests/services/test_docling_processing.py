# tests/services/test_docling_processing.py
"""Unit tests for the Docling processing module."""

from datetime import timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from temporalio.exceptions import ActivityError, TimeoutType
from temporalio.exceptions import TimeoutError as TemporalTimeoutError

from src.activities.dms_activities import DmsFileInfo
from src.config import Config
from src.services.docling_processing import (
    CombineDoclingChunksInput,
    CombineDoclingChunksOutput,
    CompressPdfImagesInput,
    CompressPdfImagesOutput,
    DeduplicateImagesInput,
    DeduplicateImagesOutput,
    DoclingActivityInput,
    DoclingChunkResult,
    ExtractChunkInput,
    PreparedPdfOutput,
    RasterizeChunkInput,
    RasterizeChunkOutput,
    SplitPdfForDoclingInput,
    SplitPdfForDoclingOutput,
    _combine_docling_chunks,
    _compress_pdf_images,
    _deduplicate_images,
    _download_and_prepare_pdf,
    _is_timeout_failure,
    _rasterize_chunk,
    _sanitize_stem,
    _split_pdf_for_docling,
)


class TestSanitizeStem:
    """Tests for the _sanitize_stem helper function."""

    def test_sanitize_stem_normal_text(self) -> None:
        """Test that normal text passes through unchanged."""
        result = _sanitize_stem("document_name")
        assert result == "document_name"

    def test_sanitize_stem_unicode_normalization(self) -> None:
        """Test that decomposed Unicode gets normalized."""
        # Test with combining diaeresis (U+0308) after U
        decomposed = "U\u0308bersicht"  # U + combining diaeresis
        result = _sanitize_stem(decomposed)
        # Should be normalized to composed form
        assert "\u0308" not in result

    def test_sanitize_stem_line_separators(self) -> None:
        """Test that line separators are removed."""
        with_separators = "doc\u2028name\u2029test"
        result = _sanitize_stem(with_separators)
        assert "\u2028" not in result
        assert "\u2029" not in result
        # Line separators are filtered out by unicodedata.category check
        assert result == "docnametest"

    def test_sanitize_stem_newlines(self) -> None:
        """Test that newlines are replaced."""
        with_newlines = "doc\nname\rtest"
        result = _sanitize_stem(with_newlines)
        assert "\n" not in result
        assert "\r" not in result


class TestPydanticModels:
    """Tests for Pydantic I/O models."""

    def test_docling_activity_input_creation(self) -> None:
        """Test DoclingActivityInput model creation."""
        file_info = DmsFileInfo(
            file_id="test-file-id",
            filename="test.pdf",
            mime_type="application/pdf",
            bucket_path="projects/test/documents/test.pdf",
        )
        project_id = uuid4()

        input_model = DoclingActivityInput(
            file_info=file_info,
            project_id=project_id,
        )

        assert input_model.file_info.filename == "test.pdf"
        assert input_model.project_id == project_id

    def test_prepared_pdf_output_creation(self) -> None:
        """Test PreparedPdfOutput model creation."""
        output = PreparedPdfOutput(
            pdf_bytes=b"test pdf content",
            filename="test.pdf",
            file_size_mb=0.1,
        )

        assert output.filename == "test.pdf"
        assert output.file_size_mb == 0.1
        assert output.pdf_bytes == b"test pdf content"

    def test_docling_chunk_result_creation(self) -> None:
        """Test DoclingChunkResult model creation."""
        result = DoclingChunkResult(
            md_content="# Test\nContent",
            content_list=[{"type": "text", "text": "Test", "page_idx": 0}],
            images={"test.png": b"image data"},
            page_offset=0,
        )

        assert result.md_content == "# Test\nContent"
        assert len(result.content_list) == 1
        assert "test.png" in result.images

    def test_combine_docling_chunks_output_creation(self) -> None:
        """Test CombineDoclingChunksOutput model creation."""
        output = CombineDoclingChunksOutput(
            md_content="Combined content",
            content_list=[{"type": "text", "text": "Combined", "page_idx": 0}],
            images={"img.png": b"data"},
            original_md_content="Original content",
        )

        assert output.md_content == "Combined content"
        assert output.original_md_content == "Original content"


class TestSplitPdfForDocling:
    """Tests for the split_pdf_for_docling activity."""

    @patch("src.services.docling.pdf_splitting.get_config", new=lambda: Config(PDF_FORCE_SPLIT_THRESHOLD_MB=30))
    async def test_no_split_for_small_pdf(self) -> None:
        """Test that small PDFs are not split (fast path, < force split threshold)."""
        pdf_content = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj xref 0 4 0000000000 65535 f 0000000009 00000 n 0000000058 00000 n 0000000115 00000 n trailer<</Size 4/Root 1 0 R>>startxref 195 %%EOF"

        input_model = SplitPdfForDoclingInput(
            pdf_bytes=pdf_content,
            file_size_mb=0.1,  # Small file, below force split threshold
        )

        with (
            patch("src.services.docling.pdf_splitting.activity.logger"),
            patch("src.services.docling.pdf_splitting.activity.heartbeat"),
        ):
            result = await _split_pdf_for_docling(input_model)

        assert len(result.chunks) == 1
        assert result.page_offsets == [0]

    @patch(
        "src.services.docling.pdf_splitting.get_config",
        new=lambda: Config(PDF_FORCE_SPLIT_THRESHOLD_MB=0, PDF_PAGE_CHUNK_SIZE=2, PDF_TARGET_CHUNK_MB=25),
    )
    async def test_split_large_pdf(self) -> None:
        """Test that large PDFs are split into chunks."""
        with patch("src.services.docling.pdf_splitting.pdfium.PdfDocument") as mock_pdf_class:
            mock_pdf = MagicMock()
            mock_pdf.__len__ = MagicMock(return_value=5)  # 5 pages
            mock_pdf.close = MagicMock()
            mock_pdf_class.return_value = mock_pdf

            mock_chunk_pdf = MagicMock()
            mock_chunk_pdf.import_pages = MagicMock()
            mock_chunk_pdf.save = MagicMock(side_effect=lambda buffer, version: buffer.write(b"chunk"))
            mock_chunk_pdf.close = MagicMock()
            mock_pdf_class.new.return_value = mock_chunk_pdf

            input_model = SplitPdfForDoclingInput(
                pdf_bytes=b"large pdf content",
                file_size_mb=10.0,  # Above thresholds, 2 MB/page, adaptive=12 capped to 2
            )

            with (
                patch("src.services.docling.pdf_splitting.activity.logger"),
                patch("src.services.docling.pdf_splitting.activity.heartbeat"),
            ):
                result = await _split_pdf_for_docling(input_model)

            # With 5 pages and chunk size 2 (capped), we expect 3 chunks
            assert len(result.chunks) == 3
            assert result.page_offsets == [0, 2, 4]


class TestCombineDoclingChunks:
    """Tests for the combine_docling_chunks activity."""

    async def test_single_chunk_no_combining(self) -> None:
        """Test that a single chunk is returned as-is."""
        chunk = DoclingChunkResult(
            md_content="# Single chunk",
            content_list=[{"type": "text", "text": "Test", "page_idx": 0}],
            images={"img.png": b"data"},
            original_md_content="Original",
            page_offset=0,
        )

        input_model = CombineDoclingChunksInput(chunk_results=[chunk])

        with (
            patch("src.services.docling.chunk_extraction.activity.logger"),
            patch("src.services.docling.chunk_extraction.activity.heartbeat"),
        ):
            result = await _combine_docling_chunks(input_model)

        assert result.md_content == "# Single chunk"
        assert len(result.content_list) == 1

    async def test_multiple_chunks_combined(self) -> None:
        """Test that multiple chunks are properly combined inline."""
        chunk1 = DoclingChunkResult(
            md_content="# Chunk 1",
            content_list=[{"type": "text", "text": "Text 1", "page_idx": 0}],
            images={"chunk1_img.png": b"data1"},
            original_md_content="Original 1",
            page_offset=0,
        )
        chunk2 = DoclingChunkResult(
            md_content="# Chunk 2",
            content_list=[{"type": "text", "text": "Text 2", "page_idx": 0}],
            images={"chunk2_img.png": b"data2"},
            original_md_content="Original 2",
            page_offset=5,  # Starts at page 5
        )

        input_model = CombineDoclingChunksInput(chunk_results=[chunk1, chunk2])

        with (
            patch("src.services.docling.chunk_extraction.activity.logger"),
            patch("src.services.docling.chunk_extraction.activity.heartbeat"),
        ):
            result = await _combine_docling_chunks(input_model)

        # Result should have inline data
        assert "# Chunk 1" in result.md_content
        assert "# Chunk 2" in result.md_content

        # Verify combined content list has adjusted page indices
        assert len(result.content_list) == 2
        assert result.content_list[0]["page_idx"] == 0  # First chunk, no offset
        assert result.content_list[1]["page_idx"] == 5  # Second chunk, offset 5

        # Check images are merged
        assert "chunk1_img.png" in result.images
        assert "chunk2_img.png" in result.images


class TestDeduplicateImages:
    """Tests for the deduplicate_images activity."""

    async def test_no_duplicates(self) -> None:
        """Test when there are no duplicate images."""
        content_list = [
            {"type": "image", "img_path": "images/img1.png", "page_idx": 0},
            {"type": "image", "img_path": "images/img2.png", "page_idx": 1},
        ]
        # Create distinct images (different enough to not match)
        images = {
            "img1.png": b"\x89PNG\r\n\x1a\n" + b"\x00" * 100,
            "img2.png": b"\x89PNG\r\n\x1a\n" + b"\xff" * 100,
        }

        input_model = DeduplicateImagesInput(
            content_list=content_list,
            images=images,
        )

        with patch("src.services.docling.chunk_extraction.HeaderFooterFilter.find_duplicate_images") as mock_find:
            mock_find.return_value = set()  # No duplicates

            with (
                patch("src.services.docling.chunk_extraction.activity.logger"),
                patch("src.services.docling.chunk_extraction.activity.heartbeat"),
            ):
                result = await _deduplicate_images(input_model)

        assert len(result.images) == 2
        assert result.duplicate_paths == []

    async def test_with_duplicates(self) -> None:
        """Test when there are duplicate images to remove."""
        content_list = [
            {"type": "image", "img_path": "images/logo1.png", "page_idx": 0},
            {"type": "image", "img_path": "images/logo2.png", "page_idx": 1},
            {"type": "image", "img_path": "images/unique.png", "page_idx": 2},
        ]
        images = {
            "logo1.png": b"logo data",
            "logo2.png": b"logo data",  # Duplicate
            "unique.png": b"unique data",
        }

        input_model = DeduplicateImagesInput(
            content_list=content_list,
            images=images,
        )

        with patch("src.services.docling.chunk_extraction.HeaderFooterFilter.find_duplicate_images") as mock_find:
            # Simulate finding logo2 as a duplicate
            mock_find.return_value = {"images/logo2.png"}

            with (
                patch("src.services.docling.chunk_extraction.activity.logger"),
                patch("src.services.docling.chunk_extraction.activity.heartbeat"),
            ):
                result = await _deduplicate_images(input_model)

        # logo2.png should be removed
        assert len(result.images) == 2
        assert "logo1.png" in result.images
        assert "unique.png" in result.images
        assert "logo2.png" not in result.images
        assert "images/logo2.png" in result.duplicate_paths


class TestDownloadAndPreparePdf:
    """Tests for the download_and_prepare_pdf activity."""

    async def test_download_valid_pdf(self) -> None:
        """Test downloading a valid PDF from DMS."""
        file_info = DmsFileInfo(
            file_id="test-file-id",
            filename="test.pdf",
            mime_type="application/pdf",
            bucket_path="projects/test/documents/test.pdf",
        )
        project_id = uuid4()

        input_model = DoclingActivityInput(
            file_info=file_info,
            project_id=project_id,
        )

        pdf_content = b"%PDF-1.4\ntest pdf content"

        with patch("src.services.docling.pdf_preparation.download_file") as mock_download:
            mock_download.return_value = pdf_content

            with patch("src.services.docling.pdf_preparation.Preprocessor.validate_pdf") as mock_validate:
                mock_validate.return_value = None  # Valid PDF

                with (
                    patch("src.services.docling.pdf_preparation.activity.logger"),
                    patch("src.services.docling.pdf_preparation.activity.heartbeat"),
                ):
                    result = await _download_and_prepare_pdf(input_model)

        assert result.pdf_bytes == pdf_content
        assert result.filename == "test.pdf"
        assert result.file_size_mb > 0

    async def test_download_and_convert_non_pdf(self) -> None:
        """Test downloading and converting a non-PDF file."""
        from src.processors.preprocessor import NotValidPdfError

        file_info = DmsFileInfo(
            file_id="test-file-id",
            filename="test.docx",
            mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            bucket_path="projects/test/documents/test.docx",
        )
        project_id = uuid4()

        input_model = DoclingActivityInput(
            file_info=file_info,
            project_id=project_id,
        )

        docx_content = b"PK\x03\x04 docx content"
        pdf_content = b"%PDF-1.4\nconverted pdf"

        with patch("src.services.docling.pdf_preparation.download_file") as mock_download:
            mock_download.return_value = docx_content

            with patch("src.services.docling.pdf_preparation.Preprocessor.validate_pdf") as mock_validate:
                mock_validate.side_effect = NotValidPdfError()

                with patch(
                    "src.services.docling.pdf_preparation.Preprocessor.convert_to_pdf_if_needed"
                ) as mock_convert:
                    mock_convert.return_value = pdf_content, "test.pdf"

                    with (
                        patch("src.services.docling.pdf_preparation.activity.logger"),
                        patch("src.services.docling.pdf_preparation.activity.heartbeat"),
                    ):
                        result = await _download_and_prepare_pdf(input_model)

        assert result.pdf_bytes == pdf_content
        assert result.filename == "test.pdf"


class TestExtractChunkInput:
    """Tests for ExtractChunkInput model."""

    def test_extract_chunk_input_creation(self) -> None:
        """Test ExtractChunkInput model creation."""
        input_model = ExtractChunkInput(
            chunk_bytes=b"chunk pdf content",
            chunk_index=0,
            total_chunks=3,
            page_offset=0,
            output_prefix="test_doc",
            filename="test.pdf",
        )

        assert input_model.chunk_index == 0
        assert input_model.total_chunks == 3
        assert input_model.page_offset == 0
        assert input_model.output_prefix == "test_doc"


class TestIntegrationScenarios:
    """Integration-style tests for common scenarios."""

    async def test_combine_chunks_preserves_page_order(self) -> None:
        """Test that combining chunks maintains proper page ordering inline."""
        chunks = [
            DoclingChunkResult(
                md_content='<seite nummer="1" />\nPage 1-2 content\n<seite nummer="2" />',
                content_list=[
                    {"type": "text", "text": "Page 1", "page_idx": 0},
                    {"type": "text", "text": "Page 2", "page_idx": 1},
                ],
                images={},
                page_offset=0,
            ),
            DoclingChunkResult(
                md_content='<seite nummer="1" />\nPage 3-4 content\n<seite nummer="2" />',
                content_list=[
                    {"type": "text", "text": "Page 3", "page_idx": 0},
                    {"type": "text", "text": "Page 4", "page_idx": 1},
                ],
                images={},
                page_offset=2,
            ),
        ]

        input_model = CombineDoclingChunksInput(chunk_results=chunks)

        with (
            patch("src.services.docling.chunk_extraction.activity.logger"),
            patch("src.services.docling.chunk_extraction.activity.heartbeat"),
        ):
            result = await _combine_docling_chunks(input_model)

        # Verify page ordering in the combined content_list
        assert result.content_list[0]["page_idx"] == 0  # Page 1
        assert result.content_list[1]["page_idx"] == 1  # Page 2
        assert result.content_list[2]["page_idx"] == 2  # Page 3 (offset 2 + 0)
        assert result.content_list[3]["page_idx"] == 3  # Page 4 (offset 2 + 1)

        # Verify seite tags are offset correctly in combined markdown
        assert '<seite nummer="1" />' in result.md_content  # Chunk 1, page 1 (offset 0)
        assert '<seite nummer="2" />' in result.md_content  # Chunk 1, page 2 (offset 0)
        assert '<seite nummer="3" />' in result.md_content  # Chunk 2, page 1+2 offset
        assert '<seite nummer="4" />' in result.md_content  # Chunk 2, page 2+2 offset

        # No chunk comment headers in output
        assert "<!-- Chunk" not in result.md_content

    async def test_image_dedup_filters_correctly(self) -> None:
        """Test that image deduplication filters the right images."""
        content_list = [
            {"type": "image", "img_path": "images/header.png", "page_idx": 0, "bbox": [0, 0, 100, 50]},
            {"type": "image", "img_path": "images/header_copy.png", "page_idx": 1, "bbox": [0, 0, 100, 50]},
            {"type": "image", "img_path": "images/content.png", "page_idx": 0, "bbox": [0, 100, 200, 300]},
        ]
        images = {
            "header.png": b"header image data",
            "header_copy.png": b"header image data",  # Same as header
            "content.png": b"unique content image",
        }

        input_model = DeduplicateImagesInput(
            content_list=content_list,
            images=images,
        )

        with patch("src.services.docling.chunk_extraction.HeaderFooterFilter.find_duplicate_images") as mock_find:
            # header_copy.png is a duplicate of header.png
            mock_find.return_value = {"images/header_copy.png"}

            with (
                patch("src.services.docling.chunk_extraction.activity.logger"),
                patch("src.services.docling.chunk_extraction.activity.heartbeat"),
            ):
                result = await _deduplicate_images(input_model)

        # Should keep header.png and content.png, remove header_copy.png
        assert "header.png" in result.images
        assert "content.png" in result.images
        assert "header_copy.png" not in result.images
        assert len(result.images) == 2


class TestAdaptiveSplitting:
    """Tests for density-aware adaptive PDF splitting."""

    @patch("src.services.docling.pdf_splitting.get_config", new=lambda: Config(PDF_FORCE_SPLIT_THRESHOLD_MB=30))
    async def test_very_small_pdf_fast_path(self) -> None:
        """Test that PDFs below force split threshold are never opened/split."""
        input_model = SplitPdfForDoclingInput(
            pdf_bytes=b"small pdf",
            file_size_mb=10.0,  # Below 30MB threshold
        )

        with (
            patch("src.services.docling.pdf_splitting.pdfium.PdfDocument") as mock_pdf_class,
            patch("src.services.docling.pdf_splitting.activity.logger"),
            patch("src.services.docling.pdf_splitting.activity.heartbeat"),
        ):
            result = await _split_pdf_for_docling(input_model)

        # PDF should NOT be opened at all
        mock_pdf_class.assert_not_called()
        assert len(result.chunks) == 1
        assert result.page_offsets == [0]

    @patch(
        "src.services.docling.pdf_splitting.get_config",
        new=lambda: Config(PDF_FORCE_SPLIT_THRESHOLD_MB=30, PDF_TARGET_CHUNK_MB=25, PDF_PAGE_CHUNK_SIZE=20),
    )
    async def test_medium_pdf_above_threshold_always_split(self) -> None:
        """Test that 50MB/100 pages PDF IS now split (above force split threshold)."""
        with patch("src.services.docling.pdf_splitting.pdfium.PdfDocument") as mock_pdf_class:
            mock_pdf = MagicMock()
            mock_pdf.__len__ = MagicMock(return_value=100)  # 100 pages
            mock_pdf.close = MagicMock()
            mock_pdf_class.return_value = mock_pdf

            mock_chunk_pdf = MagicMock()
            mock_chunk_pdf.import_pages = MagicMock()
            mock_chunk_pdf.save = MagicMock(side_effect=lambda buffer, version: buffer.write(b"chunk"))
            mock_chunk_pdf.close = MagicMock()
            mock_pdf_class.new.return_value = mock_chunk_pdf

            input_model = SplitPdfForDoclingInput(
                pdf_bytes=b"medium pdf",
                file_size_mb=50.0,  # 0.5 MB/page, adaptive=50, capped to 20
            )

            with (
                patch("src.services.docling.pdf_splitting.activity.logger"),
                patch("src.services.docling.pdf_splitting.activity.heartbeat"),
            ):
                result = await _split_pdf_for_docling(input_model)

        # 50MB / 100 pages = 0.5 MB/page; adaptive = int(25/0.5) = 50, capped to 20
        assert len(result.chunks) == 5  # 100 pages / 20 per chunk
        assert result.page_offsets == [0, 20, 40, 60, 80]

    @patch(
        "src.services.docling.pdf_splitting.get_config",
        new=lambda: Config(PDF_FORCE_SPLIT_THRESHOLD_MB=30, PDF_TARGET_CHUNK_MB=25, PDF_PAGE_CHUNK_SIZE=5),
    )
    async def test_medium_pdf_high_density_force_split(self) -> None:
        """Test that medium PDF with high density (80MB/5 pages) is force-split to 1 page/chunk."""
        with patch("src.services.docling.pdf_splitting.pdfium.PdfDocument") as mock_pdf_class:
            mock_pdf = MagicMock()
            mock_pdf.__len__ = MagicMock(return_value=5)  # 5 pages
            mock_pdf.close = MagicMock()
            mock_pdf_class.return_value = mock_pdf

            mock_chunk_pdf = MagicMock()
            mock_chunk_pdf.import_pages = MagicMock()
            mock_chunk_pdf.save = MagicMock(side_effect=lambda buffer, version: buffer.write(b"chunk"))
            mock_chunk_pdf.close = MagicMock()
            mock_pdf_class.new.return_value = mock_chunk_pdf

            input_model = SplitPdfForDoclingInput(
                pdf_bytes=b"dense pdf",
                file_size_mb=80.0,  # 16 MB/page - high density, adaptive=1
            )

            with (
                patch("src.services.docling.pdf_splitting.activity.logger"),
                patch("src.services.docling.pdf_splitting.activity.heartbeat"),
            ):
                result = await _split_pdf_for_docling(input_model)

        # 80MB / 5 pages = 16 MB/page; adaptive = max(1, int(25/16)) = 1
        assert len(result.chunks) == 5
        assert result.page_offsets == [0, 1, 2, 3, 4]

    @patch(
        "src.services.docling.pdf_splitting.get_config",
        new=lambda: Config(PDF_FORCE_SPLIT_THRESHOLD_MB=30, PDF_TARGET_CHUNK_MB=25, PDF_PAGE_CHUNK_SIZE=5),
    )
    async def test_large_pdf_adaptive_chunk_size(self) -> None:
        """Test 200MB/15 pages -> 1 page/chunk (adaptive = max(1, int(25/13.3)) = 1)."""
        with patch("src.services.docling.pdf_splitting.pdfium.PdfDocument") as mock_pdf_class:
            mock_pdf = MagicMock()
            mock_pdf.__len__ = MagicMock(return_value=15)  # 15 pages
            mock_pdf.close = MagicMock()
            mock_pdf_class.return_value = mock_pdf

            mock_chunk_pdf = MagicMock()
            mock_chunk_pdf.import_pages = MagicMock()
            mock_chunk_pdf.save = MagicMock(side_effect=lambda buffer, version: buffer.write(b"chunk"))
            mock_chunk_pdf.close = MagicMock()
            mock_pdf_class.new.return_value = mock_chunk_pdf

            input_model = SplitPdfForDoclingInput(
                pdf_bytes=b"huge pdf",
                file_size_mb=200.0,  # 13.3 MB/page, adaptive=1
            )

            with (
                patch("src.services.docling.pdf_splitting.activity.logger"),
                patch("src.services.docling.pdf_splitting.activity.heartbeat"),
            ):
                result = await _split_pdf_for_docling(input_model)

        # 200/15 = 13.3 MB/page; adaptive = max(1, int(25/13.3)) = 1
        assert len(result.chunks) == 15
        assert result.page_offsets == list(range(15))

    @patch(
        "src.services.docling.pdf_splitting.get_config",
        new=lambda: Config(PDF_FORCE_SPLIT_THRESHOLD_MB=30, PDF_TARGET_CHUNK_MB=25, PDF_PAGE_CHUNK_SIZE=5),
    )
    async def test_large_pdf_many_pages_capped(self) -> None:
        """Test 200MB/500 pages -> capped at 5 pages/chunk (adaptive=62, cap=5)."""
        with patch("src.services.docling.pdf_splitting.pdfium.PdfDocument") as mock_pdf_class:
            mock_pdf = MagicMock()
            mock_pdf.__len__ = MagicMock(return_value=500)  # 500 pages
            mock_pdf.close = MagicMock()
            mock_pdf_class.return_value = mock_pdf

            mock_chunk_pdf = MagicMock()
            mock_chunk_pdf.import_pages = MagicMock()
            mock_chunk_pdf.save = MagicMock(side_effect=lambda buffer, version: buffer.write(b"chunk"))
            mock_chunk_pdf.close = MagicMock()
            mock_pdf_class.new.return_value = mock_chunk_pdf

            input_model = SplitPdfForDoclingInput(
                pdf_bytes=b"big but thin pdf",
                file_size_mb=200.0,  # 0.4 MB/page, adaptive=62, capped to 5
            )

            with (
                patch("src.services.docling.pdf_splitting.activity.logger"),
                patch("src.services.docling.pdf_splitting.activity.heartbeat"),
            ):
                result = await _split_pdf_for_docling(input_model)

        # 200/500 = 0.4 MB/page; adaptive = 62, capped to 5
        assert len(result.chunks) == 100  # 500 pages / 5 per chunk
        assert result.page_offsets[0] == 0
        assert result.page_offsets[1] == 5
        assert result.page_offsets[-1] == 495


class TestCompressPdfImages:
    """Tests for the compress_pdf_images activity."""

    @patch("src.services.docling.pdf_compression.get_config", new=lambda: Config(ENABLE_PDF_COMPRESSION=False))
    async def test_compression_disabled_by_flag(self) -> None:
        """Test that compression is skipped when disabled by config."""
        input_model = CompressPdfImagesInput(
            pdf_bytes=b"pdf content",
            file_size_mb=100.0,
        )

        with (
            patch("src.services.docling.pdf_compression.activity.logger"),
            patch("src.services.docling.pdf_compression.activity.heartbeat"),
        ):
            result = await _compress_pdf_images(input_model)

        assert result.pdf_bytes == b"pdf content"
        assert result.file_size_mb == 100.0
        assert result.was_compressed is False

    @patch(
        "src.services.docling.pdf_compression.get_config",
        new=lambda: Config(ENABLE_PDF_COMPRESSION=True, PDF_COMPRESSION_THRESHOLD_MB=50),
    )
    async def test_compression_skipped_below_threshold_no_oversized_images(self) -> None:
        """Test that small PDFs skip compression when no oversized images are found."""
        input_model = CompressPdfImagesInput(
            pdf_bytes=b"small pdf",
            file_size_mb=30.0,  # Below 50MB threshold
        )

        with (
            patch("src.services.docling.pdf_compression._pdf_has_oversized_images", return_value=False),
            patch("src.services.docling.pdf_compression.activity.logger"),
            patch("src.services.docling.pdf_compression.activity.heartbeat"),
        ):
            result = await _compress_pdf_images(input_model)

        assert result.pdf_bytes == b"small pdf"
        assert result.file_size_mb == 30.0
        assert result.was_compressed is False

    @patch(
        "src.services.docling.pdf_compression.get_config",
        new=lambda: Config(ENABLE_PDF_COMPRESSION=True, PDF_COMPRESSION_THRESHOLD_MB=50),
    )
    async def test_compression_runs_below_threshold_when_oversized_images(self) -> None:
        """Test that small PDFs still get compressed when oversized images are detected."""
        input_model = CompressPdfImagesInput(
            pdf_bytes=b"small pdf with huge image",
            file_size_mb=30.0,  # Below 50MB threshold
        )

        compressed_bytes = b"compressed pdf"

        with (
            patch("src.services.docling.pdf_compression._pdf_has_oversized_images", return_value=True),
            patch("src.services.docling.pdf_compression._compress_pdf_images_sync", return_value=compressed_bytes),
            patch("src.services.docling.pdf_compression.activity.logger"),
            patch("src.services.docling.pdf_compression.activity.heartbeat"),
        ):
            result = await _compress_pdf_images(input_model)

        expected_size = len(compressed_bytes) / (1024 * 1024)
        assert result.pdf_bytes == compressed_bytes
        assert result.file_size_mb == expected_size
        assert result.was_compressed is True

    @patch(
        "src.services.docling.pdf_compression.get_config",
        new=lambda: Config(ENABLE_PDF_COMPRESSION=True, PDF_COMPRESSION_THRESHOLD_MB=50),
    )
    async def test_compression_graceful_fallback_on_error(self) -> None:
        """Test that compression failures return original bytes."""
        input_model = CompressPdfImagesInput(
            pdf_bytes=b"pdf content",
            file_size_mb=100.0,
        )

        with (
            patch(
                "src.services.docling.pdf_compression._compress_pdf_images_sync",
                side_effect=Exception("compression error"),
            ),
            patch("src.services.docling.pdf_compression.activity.logger"),
            patch("src.services.docling.pdf_compression.activity.heartbeat"),
        ):
            result = await _compress_pdf_images(input_model)

        assert result.pdf_bytes == b"pdf content"
        assert result.file_size_mb == 100.0
        assert result.was_compressed is False


class TestRasterizeChunk:
    """Tests for the rasterize_chunk activity."""

    async def test_rasterize_basic(self) -> None:
        """Test basic rasterization via mocked sync helper."""
        input_model = RasterizeChunkInput(
            chunk_bytes=b"pdf chunk content",
            chunk_index=0,
            total_chunks=3,
        )

        rasterized = b"rasterized pdf bytes"

        with (
            patch("src.services.docling.pdf_rasterization._rasterize_chunk_sync", return_value=rasterized),
            patch("src.services.docling.pdf_rasterization.activity.logger"),
            patch("src.services.docling.pdf_rasterization.activity.heartbeat"),
        ):
            result = await _rasterize_chunk(input_model)

        assert result.rasterized_bytes == rasterized
        assert result.original_size_mb == pytest.approx(len(b"pdf chunk content") / (1024 * 1024), abs=0.001)
        assert result.rasterized_size_mb == pytest.approx(len(rasterized) / (1024 * 1024), abs=0.001)


class TestOrchestratorRasterFallback:
    """Tests for the raster fallback logic in process_pdf_with_docling."""

    def _make_chunk_result(self, page_offset: int = 0) -> DoclingChunkResult:
        """Helper to create a DoclingChunkResult for testing."""
        return DoclingChunkResult(
            md_content=f"# Content at offset {page_offset}",
            content_list=[{"type": "text", "text": "test", "page_idx": 0}],
            images={},
            page_offset=page_offset,
        )

    async def test_all_chunks_succeed_no_fallback(self) -> None:
        """Test that when all chunks succeed, no fallback is triggered."""
        file_info = DmsFileInfo(
            file_id="test-id",
            filename="test.pdf",
            mime_type="application/pdf",
            bucket_path="p/test.pdf",
        )
        input_model = DoclingActivityInput(file_info=file_info, project_id=uuid4())

        prepared = PreparedPdfOutput(pdf_bytes=b"pdf", filename="test.pdf", file_size_mb=1.0)
        compress_out = CompressPdfImagesOutput(pdf_bytes=b"pdf", file_size_mb=1.0, was_compressed=False)
        split_out = SplitPdfForDoclingOutput(chunks=[b"c1", b"c2"], page_offsets=[0, 5])

        chunk1 = self._make_chunk_result(page_offset=0)
        chunk2 = self._make_chunk_result(page_offset=5)

        combined = CombineDoclingChunksOutput(
            md_content="combined",
            content_list=[],
            images={},
        )
        dedup_out = DeduplicateImagesOutput(images={}, duplicate_paths=[])

        with (
            patch("src.services.docling.orchestrator.download_and_prepare_pdf", return_value=prepared),
            patch("src.services.docling.orchestrator.compress_pdf_images", return_value=compress_out),
            patch("src.services.docling.orchestrator.split_pdf_for_docling", return_value=split_out),
            patch("src.services.docling.orchestrator.extract_docling_chunk", side_effect=[chunk1, chunk2]),
            patch("src.services.docling.orchestrator.rasterize_chunk") as mock_rasterize,
            patch("src.services.docling.orchestrator.combine_docling_chunks", return_value=combined),
            patch("src.services.docling.orchestrator.deduplicate_images", return_value=dedup_out),
            patch("src.services.docling.orchestrator.workflow.logger"),
        ):
            from src.services.docling_processing import process_pdf_with_docling

            result = await process_pdf_with_docling(input_model)

        assert result.markdown == "combined"
        mock_rasterize.assert_not_called()

    @patch(
        "src.services.docling.orchestrator.get_config",
        new=lambda: Config(EXTRACTION_CHUNK_CONCURRENCY=1, ENABLE_RASTER_FALLBACK=True),
    )
    async def test_failed_chunk_raster_fallback_succeeds(self) -> None:
        """Test that a failed chunk is rasterized and retried successfully."""
        file_info = DmsFileInfo(
            file_id="test-id",
            filename="test.pdf",
            mime_type="application/pdf",
            bucket_path="p/test.pdf",
        )
        input_model = DoclingActivityInput(file_info=file_info, project_id=uuid4())

        prepared = PreparedPdfOutput(pdf_bytes=b"pdf", filename="test.pdf", file_size_mb=100.0)
        compress_out = CompressPdfImagesOutput(pdf_bytes=b"pdf", file_size_mb=100.0, was_compressed=False)
        split_out = SplitPdfForDoclingOutput(chunks=[b"c1", b"c2"], page_offsets=[0, 1])

        chunk1 = self._make_chunk_result(page_offset=0)
        raster_out = RasterizeChunkOutput(
            rasterized_bytes=b"rasterized",
            original_size_mb=50.0,
            rasterized_size_mb=5.0,
        )
        fallback_chunk = self._make_chunk_result(page_offset=1)

        # First call succeeds, second fails; then fallback extraction succeeds
        extract_calls = [chunk1, RuntimeError("docling crash"), fallback_chunk]

        async def mock_extract(*args: Any, **kwargs: Any) -> DoclingChunkResult:
            """Pop and return the next result, or raise if it is an exception."""
            val = extract_calls.pop(0)
            if isinstance(val, Exception):
                raise val
            return val

        combined = CombineDoclingChunksOutput(
            md_content="combined",
            content_list=[],
            images={},
        )
        dedup_out = DeduplicateImagesOutput(images={}, duplicate_paths=[])

        with (
            patch("src.services.docling.orchestrator.download_and_prepare_pdf", return_value=prepared),
            patch("src.services.docling.orchestrator.compress_pdf_images", return_value=compress_out),
            patch("src.services.docling.orchestrator.split_pdf_for_docling", return_value=split_out),
            patch("src.services.docling.orchestrator.extract_docling_chunk", side_effect=mock_extract),
            patch("src.services.docling.orchestrator.rasterize_chunk", return_value=raster_out) as mock_rasterize,
            patch("src.services.docling.orchestrator._split_fallback_for_chunks", new_callable=AsyncMock),
            patch("src.services.docling.orchestrator.combine_docling_chunks", return_value=combined),
            patch("src.services.docling.orchestrator.deduplicate_images", return_value=dedup_out),
            patch("src.services.docling.orchestrator.workflow.logger"),
        ):
            from src.services.docling_processing import process_pdf_with_docling

            result = await process_pdf_with_docling(input_model)

        assert result.markdown == "combined"
        mock_rasterize.assert_called_once()

    @patch("src.services.docling.orchestrator.get_config", new=lambda: Config(ENABLE_RASTER_FALLBACK=True))
    async def test_failed_chunk_raster_also_fails_skips(self) -> None:
        """Test that when raster fallback also fails, the chunk is skipped gracefully."""
        file_info = DmsFileInfo(
            file_id="test-id",
            filename="test.pdf",
            mime_type="application/pdf",
            bucket_path="p/test.pdf",
        )
        input_model = DoclingActivityInput(file_info=file_info, project_id=uuid4())

        prepared = PreparedPdfOutput(pdf_bytes=b"pdf", filename="test.pdf", file_size_mb=100.0)
        compress_out = CompressPdfImagesOutput(pdf_bytes=b"pdf", file_size_mb=100.0, was_compressed=False)
        split_out = SplitPdfForDoclingOutput(chunks=[b"c1", b"c2"], page_offsets=[0, 1])

        chunk1 = self._make_chunk_result(page_offset=0)

        # First call succeeds, second fails
        extract_calls = [chunk1, RuntimeError("docling crash")]

        async def mock_extract(*args: Any, **kwargs: Any) -> DoclingChunkResult:
            """Pop and return the next result, or raise if it is an exception."""
            val = extract_calls.pop(0)
            if isinstance(val, Exception):
                raise val
            return val

        combined = CombineDoclingChunksOutput(
            md_content="partial",
            content_list=[],
            images={},
        )
        dedup_out = DeduplicateImagesOutput(images={}, duplicate_paths=[])

        with (
            patch("src.services.docling.orchestrator.download_and_prepare_pdf", return_value=prepared),
            patch("src.services.docling.orchestrator.compress_pdf_images", return_value=compress_out),
            patch("src.services.docling.orchestrator.split_pdf_for_docling", return_value=split_out),
            patch("src.services.docling.orchestrator.extract_docling_chunk", side_effect=mock_extract),
            patch("src.services.docling.orchestrator.rasterize_chunk", side_effect=RuntimeError("raster failed too")),
            patch("src.services.docling.orchestrator.combine_docling_chunks", return_value=combined),
            patch("src.services.docling.orchestrator.deduplicate_images", return_value=dedup_out),
            patch("src.services.docling.orchestrator.workflow.logger"),
        ):
            from src.services.docling_processing import process_pdf_with_docling

            result = await process_pdf_with_docling(input_model)

        # Should still produce output from the successful chunk
        assert result.markdown == "partial"

    @patch("src.services.docling.orchestrator.get_config", new=lambda: Config(ENABLE_RASTER_FALLBACK=True))
    async def test_all_chunks_fail_raises(self) -> None:
        """Test that when all chunks fail (including raster), RuntimeError is raised."""
        file_info = DmsFileInfo(
            file_id="test-id",
            filename="test.pdf",
            mime_type="application/pdf",
            bucket_path="p/test.pdf",
        )
        input_model = DoclingActivityInput(file_info=file_info, project_id=uuid4())

        prepared = PreparedPdfOutput(pdf_bytes=b"pdf", filename="test.pdf", file_size_mb=100.0)
        compress_out = CompressPdfImagesOutput(pdf_bytes=b"pdf", file_size_mb=100.0, was_compressed=False)
        split_out = SplitPdfForDoclingOutput(chunks=[b"c1"], page_offsets=[0])

        with (
            patch("src.services.docling.orchestrator.download_and_prepare_pdf", return_value=prepared),
            patch("src.services.docling.orchestrator.compress_pdf_images", return_value=compress_out),
            patch("src.services.docling.orchestrator.split_pdf_for_docling", return_value=split_out),
            patch("src.services.docling.orchestrator.extract_docling_chunk", side_effect=RuntimeError("crash")),
            patch("src.services.docling.orchestrator.rasterize_chunk", side_effect=RuntimeError("raster crash")),
            patch("src.services.docling.orchestrator.workflow.logger"),
        ):
            from temporalio.exceptions import ApplicationError

            from src.services.docling_processing import process_pdf_with_docling

            with pytest.raises(ApplicationError, match="All .* chunk.*failed"):
                await process_pdf_with_docling(input_model)


class TestIsTimeoutFailure:
    """Tests for the _is_timeout_failure helper."""

    def test_activity_error_wrapping_timeout(self) -> None:
        """ActivityError whose cause is TemporalTimeoutError → True."""
        timeout = TemporalTimeoutError("timeout", type=TimeoutType.START_TO_CLOSE, last_heartbeat_details=[])
        err = ActivityError(
            "failed",
            scheduled_event_id=1,
            started_event_id=2,
            identity="",
            activity_type="test",
            activity_id="1",
            retry_state=None,
        )
        err.__cause__ = timeout
        assert _is_timeout_failure(err) is True

    def test_activity_error_wrapping_other(self) -> None:
        """ActivityError whose cause is NOT TemporalTimeoutError → False."""
        err = ActivityError(
            "failed",
            scheduled_event_id=1,
            started_event_id=2,
            identity="",
            activity_type="test",
            activity_id="1",
            retry_state=None,
        )
        err.__cause__ = RuntimeError("crash")
        assert _is_timeout_failure(err) is False

    def test_plain_runtime_error(self) -> None:
        """Non-ActivityError → False."""
        assert _is_timeout_failure(RuntimeError("crash")) is False

    def test_temporal_timeout_without_wrapper(self) -> None:
        """Bare TemporalTimeoutError (not wrapped in ActivityError) → False."""
        assert (
            _is_timeout_failure(
                TemporalTimeoutError("timeout", type=TimeoutType.START_TO_CLOSE, last_heartbeat_details=[])
            )
            is False
        )


class TestTimeoutAwareRasterFallback:
    """Tests for timeout-aware raster fallback in process_pdf_with_docling."""

    def _make_chunk_result(self, page_offset: int = 0) -> DoclingChunkResult:
        """Create a DoclingChunkResult with the given page offset."""
        return DoclingChunkResult(
            md_content=f"# Content at offset {page_offset}",
            content_list=[{"type": "text", "text": "test", "page_idx": 0}],
            images={},
            page_offset=page_offset,
        )

    @patch("src.services.docling.orchestrator.get_config", new=lambda: Config(ENABLE_RASTER_FALLBACK=True))
    async def test_timeout_failure_skips_raster_fallback(self) -> None:
        """Chunk that fails with ActivityError(TemporalTimeoutError) skips rasterize."""
        file_info = DmsFileInfo(
            file_id="test-id",
            filename="test.pdf",
            mime_type="application/pdf",
            bucket_path="p/test.pdf",
        )
        input_model = DoclingActivityInput(file_info=file_info, project_id=uuid4())

        prepared = PreparedPdfOutput(pdf_bytes=b"pdf", filename="test.pdf", file_size_mb=100.0)
        compress_out = CompressPdfImagesOutput(pdf_bytes=b"pdf", file_size_mb=100.0, was_compressed=False)
        split_out = SplitPdfForDoclingOutput(chunks=[b"c1", b"c2"], page_offsets=[0, 1])

        chunk1 = self._make_chunk_result(page_offset=0)

        # Build a proper ActivityError wrapping TemporalTimeoutError
        timeout_err = ActivityError(
            "timeout",
            scheduled_event_id=1,
            started_event_id=2,
            identity="",
            activity_type="extract",
            activity_id="1",
            retry_state=None,
        )
        timeout_err.__cause__ = TemporalTimeoutError(
            "start_to_close timeout", type=TimeoutType.START_TO_CLOSE, last_heartbeat_details=[]
        )

        extract_calls = [chunk1, timeout_err]

        async def mock_extract(*args: Any, **kwargs: Any) -> DoclingChunkResult:
            """Pop and return the next result, or raise if it is an exception."""
            val = extract_calls.pop(0)
            if isinstance(val, BaseException):
                raise val
            return val

        combined = CombineDoclingChunksOutput(
            md_content="partial",
            content_list=[],
            images={},
        )
        dedup_out = DeduplicateImagesOutput(images={}, duplicate_paths=[])

        with (
            patch("src.services.docling.orchestrator.download_and_prepare_pdf", return_value=prepared),
            patch("src.services.docling.orchestrator.compress_pdf_images", return_value=compress_out),
            patch("src.services.docling.orchestrator.split_pdf_for_docling", return_value=split_out),
            patch("src.services.docling.orchestrator.extract_docling_chunk", side_effect=mock_extract),
            patch("src.services.docling.orchestrator.rasterize_chunk") as mock_rasterize,
            patch("src.services.docling.orchestrator.combine_docling_chunks", return_value=combined),
            patch("src.services.docling.orchestrator.deduplicate_images", return_value=dedup_out),
            patch("src.services.docling.orchestrator.workflow.logger"),
        ):
            from src.services.docling_processing import process_pdf_with_docling

            result = await process_pdf_with_docling(input_model)

        assert result.markdown == "partial"
        # Rasterize should NOT be called for timeout failures
        mock_rasterize.assert_not_called()

    @patch(
        "src.services.docling.orchestrator.get_config",
        new=lambda: Config(EXTRACTION_CHUNK_CONCURRENCY=1, ENABLE_RASTER_FALLBACK=True),
    )
    async def test_non_timeout_failure_triggers_raster_fallback(self) -> None:
        """Chunk that fails with RuntimeError DOES trigger raster fallback."""
        file_info = DmsFileInfo(
            file_id="test-id",
            filename="test.pdf",
            mime_type="application/pdf",
            bucket_path="p/test.pdf",
        )
        input_model = DoclingActivityInput(file_info=file_info, project_id=uuid4())

        prepared = PreparedPdfOutput(pdf_bytes=b"pdf", filename="test.pdf", file_size_mb=100.0)
        compress_out = CompressPdfImagesOutput(pdf_bytes=b"pdf", file_size_mb=100.0, was_compressed=False)
        split_out = SplitPdfForDoclingOutput(chunks=[b"c1", b"c2"], page_offsets=[0, 1])

        chunk1 = self._make_chunk_result(page_offset=0)
        fallback_chunk = self._make_chunk_result(page_offset=1)

        # Non-timeout failure: plain RuntimeError
        extract_calls = [chunk1, RuntimeError("docling crash"), fallback_chunk]

        async def mock_extract(*args: Any, **kwargs: Any) -> DoclingChunkResult:
            """Pop and return the next result, or raise if it is an exception."""
            val = extract_calls.pop(0)
            if isinstance(val, Exception):
                raise val
            return val

        raster_out = RasterizeChunkOutput(
            rasterized_bytes=b"rasterized",
            original_size_mb=50.0,
            rasterized_size_mb=5.0,
        )
        combined = CombineDoclingChunksOutput(
            md_content="combined",
            content_list=[],
            images={},
        )
        dedup_out = DeduplicateImagesOutput(images={}, duplicate_paths=[])

        with (
            patch("src.services.docling.orchestrator.download_and_prepare_pdf", return_value=prepared),
            patch("src.services.docling.orchestrator.compress_pdf_images", return_value=compress_out),
            patch("src.services.docling.orchestrator.split_pdf_for_docling", return_value=split_out),
            patch("src.services.docling.orchestrator.extract_docling_chunk", side_effect=mock_extract),
            patch("src.services.docling.orchestrator.rasterize_chunk", return_value=raster_out) as mock_rasterize,
            patch("src.services.docling.orchestrator._split_fallback_for_chunks", new_callable=AsyncMock),
            patch("src.services.docling.orchestrator.combine_docling_chunks", return_value=combined),
            patch("src.services.docling.orchestrator.deduplicate_images", return_value=dedup_out),
            patch("src.services.docling.orchestrator.workflow.logger"),
        ):
            from src.services.docling_processing import process_pdf_with_docling

            result = await process_pdf_with_docling(input_model)

        assert result.markdown == "combined"
        # Rasterize SHOULD be called for non-timeout failures
        mock_rasterize.assert_called_once()


class TestSequentialRetryBeforeRaster:
    """Tests for Phase 2.5: sequential retry of concurrent failures before raster fallback."""

    def _make_chunk_result(self, page_offset: int = 0) -> DoclingChunkResult:
        """Create a DoclingChunkResult with the given page offset."""
        return DoclingChunkResult(
            md_content=f"# Content at offset {page_offset}",
            content_list=[{"type": "text", "text": "test", "page_idx": 0}],
            images={},
            page_offset=page_offset,
        )

    @patch(
        "src.services.docling.orchestrator.get_config",
        new=lambda: Config(EXTRACTION_CHUNK_CONCURRENCY=2, ENABLE_RASTER_FALLBACK=True),
    )
    async def test_sequential_retry_after_concurrent_failure(self) -> None:
        """Chunk fails at concurrency=2, sequential retry succeeds → rasterize NOT called."""
        file_info = DmsFileInfo(
            file_id="test-id",
            filename="test.pdf",
            mime_type="application/pdf",
            bucket_path="p/test.pdf",
        )
        input_model = DoclingActivityInput(file_info=file_info, project_id=uuid4())

        prepared = PreparedPdfOutput(pdf_bytes=b"pdf", filename="test.pdf", file_size_mb=100.0)
        compress_out = CompressPdfImagesOutput(pdf_bytes=b"pdf", file_size_mb=100.0, was_compressed=False)
        split_out = SplitPdfForDoclingOutput(chunks=[b"c1", b"c2"], page_offsets=[0, 5])

        chunk1 = self._make_chunk_result(page_offset=0)
        retry_chunk = self._make_chunk_result(page_offset=5)

        # First call: chunk1 succeeds, chunk2 fails; sequential retry: chunk2 succeeds
        extract_calls = [chunk1, RuntimeError("OOM crash"), retry_chunk]

        async def mock_extract(*args: Any, **kwargs: Any) -> DoclingChunkResult:
            """Pop and return the next result, or raise if it is an exception."""
            val = extract_calls.pop(0)
            if isinstance(val, Exception):
                raise val
            return val

        combined = CombineDoclingChunksOutput(md_content="combined", content_list=[], images={})
        dedup_out = DeduplicateImagesOutput(images={}, duplicate_paths=[])

        with (
            patch("src.services.docling.orchestrator.download_and_prepare_pdf", return_value=prepared),
            patch("src.services.docling.orchestrator.compress_pdf_images", return_value=compress_out),
            patch("src.services.docling.orchestrator.split_pdf_for_docling", return_value=split_out),
            patch("src.services.docling.orchestrator.extract_docling_chunk", side_effect=mock_extract),
            patch("src.services.docling.orchestrator.rasterize_chunk") as mock_rasterize,
            patch("src.services.docling.orchestrator.combine_docling_chunks", return_value=combined),
            patch("src.services.docling.orchestrator.deduplicate_images", return_value=dedup_out),
            patch("src.services.docling.orchestrator.workflow.logger"),
            patch("src.services.docling.orchestrator.workflow.sleep", new_callable=AsyncMock) as mock_sleep,
        ):
            from src.services.docling_processing import process_pdf_with_docling

            result = await process_pdf_with_docling(input_model)

        assert result.markdown == "combined"
        # Sequential retry succeeded → rasterize should NOT be called
        mock_rasterize.assert_not_called()
        # Sleep called once before the sequential retry
        mock_sleep.assert_called_once()

    @patch(
        "src.services.docling.orchestrator.get_config",
        new=lambda: Config(EXTRACTION_CHUNK_CONCURRENCY=2, ENABLE_RASTER_FALLBACK=True),
    )
    async def test_sequential_retry_fails_triggers_raster(self) -> None:
        """Chunk fails at concurrency=2, sequential retry also fails → raster fallback triggered."""
        file_info = DmsFileInfo(
            file_id="test-id",
            filename="test.pdf",
            mime_type="application/pdf",
            bucket_path="p/test.pdf",
        )
        input_model = DoclingActivityInput(file_info=file_info, project_id=uuid4())

        prepared = PreparedPdfOutput(pdf_bytes=b"pdf", filename="test.pdf", file_size_mb=100.0)
        compress_out = CompressPdfImagesOutput(pdf_bytes=b"pdf", file_size_mb=100.0, was_compressed=False)
        split_out = SplitPdfForDoclingOutput(chunks=[b"c1", b"c2"], page_offsets=[0, 5])

        chunk1 = self._make_chunk_result(page_offset=0)
        fallback_chunk = self._make_chunk_result(page_offset=5)

        # chunk2 fails in parallel, fails again in sequential retry, succeeds after raster
        extract_calls = [chunk1, RuntimeError("OOM"), RuntimeError("OOM again"), fallback_chunk]

        async def mock_extract(*args: Any, **kwargs: Any) -> DoclingChunkResult:
            """Pop and return the next result, or raise if it is an exception."""
            val = extract_calls.pop(0)
            if isinstance(val, Exception):
                raise val
            return val

        raster_out = RasterizeChunkOutput(
            rasterized_bytes=b"rasterized",
            original_size_mb=50.0,
            rasterized_size_mb=5.0,
        )
        combined = CombineDoclingChunksOutput(md_content="combined", content_list=[], images={})
        dedup_out = DeduplicateImagesOutput(images={}, duplicate_paths=[])

        with (
            patch("src.services.docling.orchestrator.download_and_prepare_pdf", return_value=prepared),
            patch("src.services.docling.orchestrator.compress_pdf_images", return_value=compress_out),
            patch("src.services.docling.orchestrator.split_pdf_for_docling", return_value=split_out),
            patch("src.services.docling.orchestrator.extract_docling_chunk", side_effect=mock_extract),
            patch("src.services.docling.orchestrator.rasterize_chunk", return_value=raster_out) as mock_rasterize,
            patch("src.services.docling.orchestrator._split_fallback_for_chunks", new_callable=AsyncMock),
            patch("src.services.docling.orchestrator.combine_docling_chunks", return_value=combined),
            patch("src.services.docling.orchestrator.deduplicate_images", return_value=dedup_out),
            patch("src.services.docling.orchestrator.workflow.logger"),
            patch("src.services.docling.orchestrator.workflow.sleep", new_callable=AsyncMock),
        ):
            from src.services.docling_processing import process_pdf_with_docling

            result = await process_pdf_with_docling(input_model)

        assert result.markdown == "combined"
        # Sequential retry failed → raster fallback SHOULD be called
        mock_rasterize.assert_called_once()

    @patch(
        "src.services.docling.orchestrator.get_config",
        new=lambda: Config(EXTRACTION_CHUNK_CONCURRENCY=1, ENABLE_RASTER_FALLBACK=True),
    )
    async def test_sequential_retry_skipped_when_already_sequential(self) -> None:
        """At concurrency=1, failure goes straight to raster (no double-retry)."""
        file_info = DmsFileInfo(
            file_id="test-id",
            filename="test.pdf",
            mime_type="application/pdf",
            bucket_path="p/test.pdf",
        )
        input_model = DoclingActivityInput(file_info=file_info, project_id=uuid4())

        prepared = PreparedPdfOutput(pdf_bytes=b"pdf", filename="test.pdf", file_size_mb=100.0)
        compress_out = CompressPdfImagesOutput(pdf_bytes=b"pdf", file_size_mb=100.0, was_compressed=False)
        split_out = SplitPdfForDoclingOutput(chunks=[b"c1", b"c2"], page_offsets=[0, 5])

        chunk1 = self._make_chunk_result(page_offset=0)
        fallback_chunk = self._make_chunk_result(page_offset=5)

        # chunk2 fails once (in "parallel" at concurrency=1), then succeeds via raster
        # Only 3 calls total: no sequential retry in between
        extract_calls = [chunk1, RuntimeError("crash"), fallback_chunk]

        async def mock_extract(*args: Any, **kwargs: Any) -> DoclingChunkResult:
            """Pop and return the next result, or raise if it is an exception."""
            val = extract_calls.pop(0)
            if isinstance(val, Exception):
                raise val
            return val

        raster_out = RasterizeChunkOutput(
            rasterized_bytes=b"rasterized",
            original_size_mb=50.0,
            rasterized_size_mb=5.0,
        )
        combined = CombineDoclingChunksOutput(md_content="combined", content_list=[], images={})
        dedup_out = DeduplicateImagesOutput(images={}, duplicate_paths=[])

        with (
            patch("src.services.docling.orchestrator.download_and_prepare_pdf", return_value=prepared),
            patch("src.services.docling.orchestrator.compress_pdf_images", return_value=compress_out),
            patch("src.services.docling.orchestrator.split_pdf_for_docling", return_value=split_out),
            patch("src.services.docling.orchestrator.extract_docling_chunk", side_effect=mock_extract),
            patch("src.services.docling.orchestrator.rasterize_chunk", return_value=raster_out) as mock_rasterize,
            patch("src.services.docling.orchestrator._split_fallback_for_chunks", new_callable=AsyncMock),
            patch("src.services.docling.orchestrator.combine_docling_chunks", return_value=combined),
            patch("src.services.docling.orchestrator.deduplicate_images", return_value=dedup_out),
            patch("src.services.docling.orchestrator.workflow.logger"),
        ):
            from src.services.docling_processing import process_pdf_with_docling

            result = await process_pdf_with_docling(input_model)

        assert result.markdown == "combined"
        # At concurrency=1, no sequential retry — goes straight to raster
        mock_rasterize.assert_called_once()
        # Verify only 3 extract calls were made (not 4 with a sequential retry)
        assert len(extract_calls) == 0

    @patch(
        "src.services.docling.orchestrator.get_config",
        new=lambda: Config(EXTRACTION_CHUNK_CONCURRENCY=2, ENABLE_RASTER_FALLBACK=True, PDF_TARGET_CHUNK_MB=25),
    )
    async def test_oversized_chunk_skips_raster_fallback(self) -> None:
        """Chunk larger than PDF_TARGET_CHUNK_MB skips raster fallback (rasterization would increase size)."""
        file_info = DmsFileInfo(
            file_id="test-id",
            filename="test.pdf",
            mime_type="application/pdf",
            bucket_path="p/test.pdf",
        )
        input_model = DoclingActivityInput(file_info=file_info, project_id=uuid4())

        prepared = PreparedPdfOutput(pdf_bytes=b"pdf", filename="test.pdf", file_size_mb=100.0)
        compress_out = CompressPdfImagesOutput(pdf_bytes=b"pdf", file_size_mb=100.0, was_compressed=False)

        # Chunk of 30MB (> 25MB target) — should skip raster fallback
        oversized_chunk = b"x" * (30 * 1024 * 1024)
        split_out = SplitPdfForDoclingOutput(chunks=[b"c1", oversized_chunk], page_offsets=[0, 5])

        chunk1 = self._make_chunk_result(page_offset=0)

        # chunk1 succeeds, oversized chunk fails in parallel, fails again in sequential retry
        extract_calls = [chunk1, RuntimeError("OOM"), RuntimeError("OOM again")]

        async def mock_extract(*args: Any, **kwargs: Any) -> DoclingChunkResult:
            """Pop and return the next result, or raise if it is an exception."""
            val = extract_calls.pop(0)
            if isinstance(val, Exception):
                raise val
            return val

        combined = CombineDoclingChunksOutput(md_content="combined", content_list=[], images={})
        dedup_out = DeduplicateImagesOutput(images={}, duplicate_paths=[])

        with (
            patch("src.services.docling.orchestrator.download_and_prepare_pdf", return_value=prepared),
            patch("src.services.docling.orchestrator.compress_pdf_images", return_value=compress_out),
            patch("src.services.docling.orchestrator.split_pdf_for_docling", return_value=split_out),
            patch("src.services.docling.orchestrator.extract_docling_chunk", side_effect=mock_extract),
            patch("src.services.docling.orchestrator.rasterize_chunk") as mock_rasterize,
            patch("src.services.docling.orchestrator.combine_docling_chunks", return_value=combined),
            patch("src.services.docling.orchestrator.deduplicate_images", return_value=dedup_out),
            patch("src.services.docling.orchestrator.workflow.logger"),
            patch("src.services.docling.orchestrator.workflow.sleep", new_callable=AsyncMock),
        ):
            from src.services.docling_processing import process_pdf_with_docling

            result = await process_pdf_with_docling(input_model)

        assert result.markdown == "combined"
        # Oversized chunk → raster fallback should be SKIPPED
        mock_rasterize.assert_not_called()

    @patch(
        "src.services.docling.orchestrator.get_config",
        new=lambda: Config(EXTRACTION_CHUNK_CONCURRENCY=2, ENABLE_RASTER_FALLBACK=True),
    )
    async def test_sequential_retry_sleeps_before_each_attempt(self) -> None:
        """Sequential retry calls workflow.sleep(10s) before each retry attempt."""
        file_info = DmsFileInfo(
            file_id="test-id",
            filename="test.pdf",
            mime_type="application/pdf",
            bucket_path="p/test.pdf",
        )
        input_model = DoclingActivityInput(file_info=file_info, project_id=uuid4())

        prepared = PreparedPdfOutput(pdf_bytes=b"pdf", filename="test.pdf", file_size_mb=100.0)
        compress_out = CompressPdfImagesOutput(pdf_bytes=b"pdf", file_size_mb=100.0, was_compressed=False)
        split_out = SplitPdfForDoclingOutput(chunks=[b"c1", b"c2", b"c3"], page_offsets=[0, 5, 10])

        chunk1 = self._make_chunk_result(page_offset=0)
        retry_chunk2 = self._make_chunk_result(page_offset=5)
        retry_chunk3 = self._make_chunk_result(page_offset=10)

        # chunk1 succeeds, chunk2+3 fail in parallel, both succeed in sequential retry
        extract_calls = [chunk1, RuntimeError("OOM"), RuntimeError("OOM"), retry_chunk2, retry_chunk3]

        async def mock_extract(*args: Any, **kwargs: Any) -> DoclingChunkResult:
            """Pop and return the next result, or raise if it is an exception."""
            val = extract_calls.pop(0)
            if isinstance(val, Exception):
                raise val
            return val

        combined = CombineDoclingChunksOutput(md_content="combined", content_list=[], images={})
        dedup_out = DeduplicateImagesOutput(images={}, duplicate_paths=[])

        with (
            patch("src.services.docling.orchestrator.download_and_prepare_pdf", return_value=prepared),
            patch("src.services.docling.orchestrator.compress_pdf_images", return_value=compress_out),
            patch("src.services.docling.orchestrator.split_pdf_for_docling", return_value=split_out),
            patch("src.services.docling.orchestrator.extract_docling_chunk", side_effect=mock_extract),
            patch("src.services.docling.orchestrator.rasterize_chunk") as mock_rasterize,
            patch("src.services.docling.orchestrator.combine_docling_chunks", return_value=combined),
            patch("src.services.docling.orchestrator.deduplicate_images", return_value=dedup_out),
            patch("src.services.docling.orchestrator.workflow.logger"),
            patch("src.services.docling.orchestrator.workflow.sleep", new_callable=AsyncMock) as mock_sleep,
        ):
            from src.services.docling_processing import process_pdf_with_docling

            result = await process_pdf_with_docling(input_model)

        assert result.markdown == "combined"
        mock_rasterize.assert_not_called()
        # Sleep called once per retryable chunk (2 chunks failed → 2 sleeps)
        assert mock_sleep.call_count == 2
        mock_sleep.assert_called_with(timedelta(seconds=10))


class TestForceSplit:
    """Tests for force_split flag in PDF splitting."""

    @patch(
        "src.services.docling.pdf_splitting.get_config",
        new=lambda: Config(PDF_FORCE_SPLIT_THRESHOLD_MB=100, PDF_TARGET_CHUNK_MB=25, PDF_PAGE_CHUNK_SIZE=50),
    )
    async def test_force_split_bypasses_size_threshold(self) -> None:
        """force_split=True splits even when file is below size threshold."""
        with patch("src.services.docling.pdf_splitting.pdfium.PdfDocument") as mock_pdf_class:
            mock_pdf = MagicMock()
            mock_pdf.__len__ = MagicMock(return_value=200)  # 200 pages
            mock_pdf.close = MagicMock()
            mock_pdf_class.return_value = mock_pdf

            mock_chunk_pdf = MagicMock()
            mock_chunk_pdf.import_pages = MagicMock()
            mock_chunk_pdf.save = MagicMock(side_effect=lambda buffer, version: buffer.write(b"chunk"))
            mock_chunk_pdf.close = MagicMock()
            mock_pdf_class.new.return_value = mock_chunk_pdf

            input_model = SplitPdfForDoclingInput(
                pdf_bytes=b"small pdf but many pages",
                file_size_mb=4.0,  # Well below 100MB threshold
                force_split=True,
            )

            with (
                patch("src.services.docling.pdf_splitting.activity.logger"),
                patch("src.services.docling.pdf_splitting.activity.heartbeat"),
            ):
                result = await _split_pdf_for_docling(input_model)

        # Should have been split despite being below size threshold
        # 4MB / 200 pages = 0.02 MB/page; adaptive = int(25/0.02) = 1250, capped to 50
        assert len(result.chunks) == 4  # 200 pages / 50 per chunk
        assert result.page_offsets == [0, 50, 100, 150]

    @patch(
        "src.services.docling.pdf_splitting.get_config",
        new=lambda: Config(PDF_FORCE_SPLIT_THRESHOLD_MB=100),
    )
    async def test_no_force_split_respects_size_threshold(self) -> None:
        """Without force_split, small PDFs still take the fast path."""
        input_model = SplitPdfForDoclingInput(
            pdf_bytes=b"small pdf",
            file_size_mb=4.0,
            force_split=False,
        )

        with (
            patch("src.services.docling.pdf_splitting.pdfium.PdfDocument") as mock_pdf_class,
            patch("src.services.docling.pdf_splitting.activity.logger"),
            patch("src.services.docling.pdf_splitting.activity.heartbeat"),
        ):
            result = await _split_pdf_for_docling(input_model)

        mock_pdf_class.assert_not_called()
        assert len(result.chunks) == 1
        assert result.page_offsets == [0]

    @patch(
        "src.services.docling.pdf_splitting.get_config",
        new=lambda: Config(PDF_FORCE_SPLIT_THRESHOLD_MB=100, PDF_TARGET_CHUNK_MB=25, PDF_PAGE_CHUNK_SIZE=50),
    )
    async def test_force_split_single_page_returns_single_chunk(self) -> None:
        """force_split on a 1-page PDF still returns 1 chunk (can't split further)."""
        with patch("src.services.docling.pdf_splitting.pdfium.PdfDocument") as mock_pdf_class:
            mock_pdf = MagicMock()
            mock_pdf.__len__ = MagicMock(return_value=1)
            mock_pdf.close = MagicMock()
            mock_pdf_class.return_value = mock_pdf

            mock_chunk_pdf = MagicMock()
            mock_chunk_pdf.import_pages = MagicMock()
            mock_chunk_pdf.save = MagicMock(side_effect=lambda buffer, version: buffer.write(b"chunk"))
            mock_chunk_pdf.close = MagicMock()
            mock_pdf_class.new.return_value = mock_chunk_pdf

            input_model = SplitPdfForDoclingInput(
                pdf_bytes=b"tiny pdf",
                file_size_mb=0.1,
                force_split=True,
            )

            with (
                patch("src.services.docling.pdf_splitting.activity.logger"),
                patch("src.services.docling.pdf_splitting.activity.heartbeat"),
            ):
                result = await _split_pdf_for_docling(input_model)

        assert len(result.chunks) == 1
        assert result.page_offsets == [0]


class TestSplitFallback:
    """Tests for the split fallback phase in _extract_all_chunks."""

    def _make_chunk_result(self, page_offset: int = 0) -> DoclingChunkResult:
        return DoclingChunkResult(
            md_content=f"# Content at offset {page_offset}",
            content_list=[{"type": "text", "text": "test", "page_idx": 0}],
            images={},
            page_offset=page_offset,
        )

    async def test_split_fallback_triggers_on_failure(self) -> None:
        """When a single-chunk extraction fails, split fallback splits and retries."""
        from src.services.docling.orchestrator import _split_fallback_for_chunks

        sub_result_0 = self._make_chunk_result(page_offset=0)
        sub_result_1 = self._make_chunk_result(page_offset=50)
        split_output = SplitPdfForDoclingOutput(
            chunks=[b"sub1", b"sub2"],
            page_offsets=[0, 50],
        )

        chunk_results: list[DoclingChunkResult] = []
        failed_indices = [0]

        with (
            patch(
                "src.services.docling.orchestrator.split_pdf_for_docling",
                return_value=split_output,
            ) as mock_split,
            patch(
                "src.services.docling.orchestrator.extract_docling_chunk",
                side_effect=[sub_result_0, sub_result_1],
            ),
            patch("src.services.docling.orchestrator.workflow.logger"),
        ):
            await _split_fallback_for_chunks(
                failed_indices=failed_indices,
                pdf_chunks=[b"big_pdf"],
                page_offsets=[0],
                stem="test",
                filename="test.pdf",
                project_id=None,
                cfg=Config(),
                chunk_results=chunk_results,
            )

        mock_split.assert_called_once()
        _, kwargs = mock_split.call_args
        assert kwargs["force_split"] is True
        assert len(chunk_results) == 2
        assert 0 not in failed_indices

    async def test_split_fallback_skips_single_subchunk(self) -> None:
        """If splitting produces only 1 sub-chunk, skip (would just repeat the failure)."""
        from src.services.docling.orchestrator import _split_fallback_for_chunks

        split_output = SplitPdfForDoclingOutput(
            chunks=[b"same_chunk"],
            page_offsets=[0],
        )

        chunk_results: list[DoclingChunkResult] = []
        failed_indices = [0]

        with (
            patch(
                "src.services.docling.orchestrator.split_pdf_for_docling",
                return_value=split_output,
            ),
            patch("src.services.docling.orchestrator.extract_docling_chunk") as mock_extract,
            patch("src.services.docling.orchestrator.workflow.logger"),
        ):
            await _split_fallback_for_chunks(
                failed_indices=failed_indices,
                pdf_chunks=[b"pdf"],
                page_offsets=[0],
                stem="test",
                filename="test.pdf",
                project_id=None,
                cfg=Config(),
                chunk_results=chunk_results,
            )

        mock_extract.assert_not_called()
        assert len(chunk_results) == 0
        assert 0 in failed_indices

    async def test_split_fallback_partial_success(self) -> None:
        """If some sub-chunks succeed and some fail, collect the successes."""
        from src.services.docling.orchestrator import _split_fallback_for_chunks

        sub_result_0 = self._make_chunk_result(page_offset=0)
        split_output = SplitPdfForDoclingOutput(
            chunks=[b"sub1", b"sub2", b"sub3"],
            page_offsets=[0, 50, 100],
        )

        chunk_results: list[DoclingChunkResult] = []
        failed_indices = [0]

        with (
            patch(
                "src.services.docling.orchestrator.split_pdf_for_docling",
                return_value=split_output,
            ),
            patch(
                "src.services.docling.orchestrator.extract_docling_chunk",
                side_effect=[sub_result_0, RuntimeError("docling failed"), sub_result_0],
            ),
            patch("src.services.docling.orchestrator.workflow.logger"),
        ):
            await _split_fallback_for_chunks(
                failed_indices=failed_indices,
                pdf_chunks=[b"pdf"],
                page_offsets=[0],
                stem="test",
                filename="test.pdf",
                project_id=None,
                cfg=Config(),
                chunk_results=chunk_results,
            )

        assert len(chunk_results) == 2
        assert 0 not in failed_indices


class TestExtractDoclingChunk:
    """Tests for the submit-poll-resubmit loop in extract_docling_chunk."""

    def _make_chunk_result(self, page_offset: int = 0) -> DoclingChunkResult:
        """Create a DoclingChunkResult with the given page offset."""
        return DoclingChunkResult(
            md_content=f"# Content at offset {page_offset}",
            content_list=[{"type": "text", "text": "test", "page_idx": 0}],
            images={},
            page_offset=page_offset,
        )

    async def test_happy_path_submit_then_wait(self) -> None:
        """Submit returns task_id, wait returns result — single round-trip."""
        from src.services.docling.schemas import SubmitChunkOutput, WaitForChunkOutput

        chunk_result = self._make_chunk_result()
        submit_out = SubmitChunkOutput(task_id="task-42")
        wait_out = WaitForChunkOutput(task_not_found=False, result=chunk_result)

        with (
            patch("src.services.docling.orchestrator.submit_chunk_to_docling", return_value=submit_out),
            patch("src.services.docling.orchestrator.wait_for_docling_result", return_value=wait_out),
            patch("src.services.docling.orchestrator.workflow.logger"),
        ):
            from src.services.docling.orchestrator import extract_docling_chunk

            result = await extract_docling_chunk(
                chunk_bytes=b"pdf",
                chunk_index=0,
                total_chunks=1,
                page_offset=0,
                output_prefix="test",
                filename="test.pdf",
            )

        assert result.md_content == "# Content at offset 0"

    async def test_task_lost_resubmit_succeeds(self) -> None:
        """First wait returns task_not_found, second attempt succeeds."""
        from src.services.docling.schemas import SubmitChunkOutput, WaitForChunkOutput

        chunk_result = self._make_chunk_result()
        submit_out_1 = SubmitChunkOutput(task_id="task-lost")
        submit_out_2 = SubmitChunkOutput(task_id="task-ok")
        wait_lost = WaitForChunkOutput(task_not_found=True, result=None)
        wait_ok = WaitForChunkOutput(task_not_found=False, result=chunk_result)

        with (
            patch(
                "src.services.docling.orchestrator.submit_chunk_to_docling",
                side_effect=[submit_out_1, submit_out_2],
            ),
            patch(
                "src.services.docling.orchestrator.wait_for_docling_result",
                side_effect=[wait_lost, wait_ok],
            ),
            patch("src.services.docling.orchestrator.workflow.logger"),
            patch("src.services.docling.orchestrator.workflow.sleep", new_callable=AsyncMock) as mock_sleep,
        ):
            from src.services.docling.orchestrator import extract_docling_chunk

            result = await extract_docling_chunk(
                chunk_bytes=b"pdf",
                chunk_index=0,
                total_chunks=1,
                page_offset=0,
                output_prefix="test",
                filename="test.pdf",
            )

        assert result.md_content == "# Content at offset 0"
        # Sleep between resubmit attempts
        mock_sleep.assert_called_once_with(timedelta(seconds=10))

    async def test_max_resubmit_exhausted(self) -> None:
        """All resubmit attempts return task_not_found — raises ApplicationError."""
        from temporalio.exceptions import ApplicationError

        from src.services.docling.schemas import SubmitChunkOutput, WaitForChunkOutput

        submit_out = SubmitChunkOutput(task_id="task-lost")
        wait_lost = WaitForChunkOutput(task_not_found=True, result=None)

        with (
            patch("src.services.docling.orchestrator.submit_chunk_to_docling", return_value=submit_out),
            patch("src.services.docling.orchestrator.wait_for_docling_result", return_value=wait_lost),
            patch("src.services.docling.orchestrator.workflow.logger"),
            patch("src.services.docling.orchestrator.workflow.sleep", new_callable=AsyncMock),
        ):
            from src.services.docling.orchestrator import extract_docling_chunk

            with pytest.raises(ApplicationError, match="task lost 2 times"):
                await extract_docling_chunk(
                    chunk_bytes=b"pdf",
                    chunk_index=0,
                    total_chunks=1,
                    page_offset=0,
                    output_prefix="test",
                    filename="test.pdf",
                    max_resubmit_attempts=2,
                )

    async def test_wait_timeout_propagates(self) -> None:
        """Wait activity timeout propagates as ActivityError — not caught by resubmit loop."""
        from src.services.docling.schemas import SubmitChunkOutput

        submit_out = SubmitChunkOutput(task_id="task-42")

        timeout_err = ActivityError(
            "timeout",
            scheduled_event_id=1,
            started_event_id=2,
            identity="",
            activity_type="wait_for_docling_result",
            activity_id="1",
            retry_state=None,
        )
        timeout_err.__cause__ = TemporalTimeoutError(
            "start_to_close timeout", type=TimeoutType.START_TO_CLOSE, last_heartbeat_details=[]
        )

        with (
            patch("src.services.docling.orchestrator.submit_chunk_to_docling", return_value=submit_out),
            patch("src.services.docling.orchestrator.wait_for_docling_result", side_effect=timeout_err),
            patch("src.services.docling.orchestrator.workflow.logger"),
        ):
            from src.services.docling.orchestrator import extract_docling_chunk

            with pytest.raises(ActivityError):
                await extract_docling_chunk(
                    chunk_bytes=b"pdf",
                    chunk_index=0,
                    total_chunks=1,
                    page_offset=0,
                    output_prefix="test",
                    filename="test.pdf",
                )
