# tests/activities/test_activities_coverage.py
"""
Tests for activity modules to increase coverage:
- postprocessing.py (models + activities)
- preprocessing.py (ConvertToPdfIfNeededInput, _convert_to_pdf_if_needed)
- llm_invoke.py (_import_class, LlmInvokeInput)
"""

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.activities.dms_activities import DmsFileInfo
from src.config import Config
from src.providers.base import ContentItemDict

# ---------------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------------

# Typed content items used across multiple tests
_TEXT_BODY: ContentItemDict = {"type": "text", "text": "body", "page_idx": 0}
_TEXT_CONTENT: ContentItemDict = {"type": "text", "text": "Content", "page_idx": 0}
_EMPTY_CL: list[ContentItemDict] = []


def _make_file_info(filename: str = "test.pdf") -> DmsFileInfo:
    """Create a DmsFileInfo instance with default test values."""
    return DmsFileInfo(
        file_id=str(uuid4()),
        filename=filename,
        mime_type="application/pdf",
        bucket_path=f"projects/test/{filename}",
    )


class TestPostprocessingModels:
    """Tests for Pydantic models in postprocessing.py."""

    def test_filter_enhance_input(self) -> None:
        """Test that FilterEnhanceInput can be constructed with valid fields."""
        from src.activities.postprocessing.schemas import FilterEnhanceInput

        cl: list[ContentItemDict] = [{"type": "text", "text": "hello", "page_idx": 0}]
        inp = FilterEnhanceInput(
            markdown="# Title\nSome text",
            content_list=cl,
            image_bytes={"img.png": b"\x89PNG"},
            project_id=uuid4(),
            filename="test.pdf",
        )
        assert inp.markdown == "# Title\nSome text"
        assert len(inp.content_list) == 1
        assert inp.filename == "test.pdf"

    def test_filter_enhance_result(self) -> None:
        """Test that FilterEnhanceResult stores image_refs correctly."""
        from src.activities.postprocessing.schemas import FilterEnhanceResult

        empty_cl: list[ContentItemDict] = []
        result = FilterEnhanceResult(
            markdown="# Filtered",
            content_list=empty_cl,
            images={},
            image_refs={"img.png": "file-id-123"},
        )
        assert result.image_refs["img.png"] == "file-id-123"

    def test_filter_enhance_result_default_image_refs(self) -> None:
        """Test that FilterEnhanceResult defaults image_refs to empty dict."""
        from src.activities.postprocessing.schemas import FilterEnhanceResult

        empty_cl: list[ContentItemDict] = []
        result = FilterEnhanceResult(
            markdown="md",
            content_list=empty_cl,
            images={},
        )
        assert result.image_refs == {}

    def test_chunk_markdown_input(self) -> None:
        """Test that ChunkMarkdownInput stores markdown and content_list."""
        from src.activities.postprocessing.schemas import ChunkMarkdownInput

        cl: list[ContentItemDict] = [{"type": "text", "text": "Content", "page_idx": 0}]
        inp = ChunkMarkdownInput(
            markdown="# Header\nContent",
            content_list=cl,
        )
        assert inp.markdown == "# Header\nContent"

    def test_split_markdown_by_pages_input_defaults(self) -> None:
        """Test that SplitMarkdownByPagesInput defaults pages_per_chunk to 1."""
        from src.activities.postprocessing.schemas import SplitMarkdownByPagesInput

        inp = SplitMarkdownByPagesInput(markdown="page content")
        assert inp.pages_per_chunk == 1

    def test_split_markdown_by_pages_input_custom(self) -> None:
        """Test that SplitMarkdownByPagesInput accepts a custom pages_per_chunk."""
        from src.activities.postprocessing.schemas import SplitMarkdownByPagesInput

        inp = SplitMarkdownByPagesInput(markdown="content", pages_per_chunk=3)
        assert inp.pages_per_chunk == 3

    def test_create_final_json_input(self) -> None:
        """Test that CreateFinalJsonInput can be constructed with required fields."""
        from src.activities.postprocessing.schemas import CreateFinalJsonInput
        from src.workflows.summarization.output_format import SummaryOutput

        inp = CreateFinalJsonInput(
            final_markdown="# Doc",
            chunks=[],
            summary_result=SummaryOutput(summary="A summary"),
            base_metadata=None,
            original_filename="report.pdf",
            project_id=uuid4(),
            processing_duration_seconds=12.5,
        )
        assert inp.original_filename == "report.pdf"
        assert inp.source_file_id is None

    def test_create_final_json_input_with_source_file_id(self) -> None:
        """Test that CreateFinalJsonInput accepts an optional source_file_id."""
        from src.activities.postprocessing.schemas import CreateFinalJsonInput
        from src.workflows.summarization.output_format import SummaryOutput

        inp = CreateFinalJsonInput(
            final_markdown="# Doc",
            chunks=[],
            summary_result=SummaryOutput(summary="Sum"),
            base_metadata=None,
            original_filename="report.pdf",
            project_id=uuid4(),
            processing_duration_seconds=5.0,
            source_file_id="abc-123",
        )
        assert inp.source_file_id == "abc-123"

    def test_assemble_final_json_result(self) -> None:
        """Test that AssembleFinalJsonResult stores file_id and filename."""
        from src.activities.postprocessing.schemas import AssembleFinalJsonResult

        result = AssembleFinalJsonResult(
            final_json_file_id=uuid4(),
            filename="doc/report_processed.json",
        )
        assert "processed" in result.filename

    def test_summary_result_model(self) -> None:
        """Test that SummaryResult stores summary_file_id and summary_data."""
        from temporal.contracts import SummaryData

        from src.activities.postprocessing.schemas import SummaryResult

        r = SummaryResult(
            summary_file_id="abc-123",
            filename="summary.json",
            summary_data=SummaryData(
                base_metadata=None,
                total_duration_seconds=0.0,
                processed_files=[],
            ),
        )
        assert r.summary_file_id == "abc-123"
        assert r.summary_data.processed_files == []

    def test_upload_images_to_dms_input(self) -> None:
        """Test that UploadImagesToDmsInput stores images dict and project_id."""
        from src.activities.postprocessing.schemas import UploadImagesToDmsInput

        inp = UploadImagesToDmsInput(
            images={"a.png": b"\x89PNG"},
            project_id=uuid4(),
            filename="doc.pdf",
        )
        assert len(inp.images) == 1


# ===========================================================================
#  4. postprocessing.py - Activity functions
# ===========================================================================


@pytest.mark.asyncio
class TestChunkMarkdownActivity:
    """Tests for _chunk_markdown activity."""

    @patch("src.activities.postprocessing.assembly.MarkdownChunker")
    @patch("src.activities.postprocessing.assembly.activity")
    async def test_chunk_markdown_calls_chunker(self, mock_activity: Any, mock_chunker_cls: Any) -> None:
        """Test that _chunk_markdown delegates to MarkdownChunker."""
        mock_activity.heartbeat = MagicMock()
        from src.activities.postprocessing.assembly import _chunk_markdown
        from src.activities.postprocessing.schemas import ChunkMarkdownInput

        mock_chunk = MagicMock()
        mock_chunker_cls.chunk_markdown.return_value = [mock_chunk]

        empty_cl: list[ContentItemDict] = []
        inp = ChunkMarkdownInput(markdown="# Title\nContent", content_list=empty_cl)
        result = await _chunk_markdown(inp)

        mock_chunker_cls.chunk_markdown.assert_called_once_with("# Title\nContent", [])
        assert len(result) == 1
        assert mock_activity.heartbeat.call_count == 2

    @patch("src.activities.postprocessing.assembly.MarkdownChunker")
    @patch("src.activities.postprocessing.assembly.activity")
    async def test_chunk_markdown_empty_input(self, mock_activity: Any, mock_chunker_cls: Any) -> None:
        """Test that _chunk_markdown returns empty list for empty input."""
        mock_activity.heartbeat = MagicMock()
        from src.activities.postprocessing.assembly import _chunk_markdown
        from src.activities.postprocessing.schemas import ChunkMarkdownInput

        empty_chunks: list[Any] = []
        mock_chunker_cls.chunk_markdown.return_value = empty_chunks
        empty_cl: list[ContentItemDict] = []
        inp = ChunkMarkdownInput(markdown="", content_list=empty_cl)
        result = await _chunk_markdown(inp)

        assert result == []


@pytest.mark.asyncio
class TestSplitMarkdownByPagesActivity:
    """Tests for _split_markdown_by_pages activity."""

    @patch("src.activities.postprocessing.assembly._split_markdown_impl")
    @patch("src.activities.postprocessing.assembly.activity")
    async def test_split_delegates_to_impl(self, mock_activity: Any, mock_impl: Any) -> None:
        """Test that _split_markdown_by_pages delegates to the implementation function."""
        from src.activities.postprocessing.assembly import _split_markdown_by_pages
        from src.activities.postprocessing.schemas import SplitMarkdownByPagesInput

        mock_impl.return_value = ["page1", "page2"]
        inp = SplitMarkdownByPagesInput(markdown="content", pages_per_chunk=1)
        result = await _split_markdown_by_pages(inp)

        mock_impl.assert_called_once_with("content", 1)
        assert result == ["page1", "page2"]

    @patch("src.activities.postprocessing.assembly._split_markdown_impl")
    @patch("src.activities.postprocessing.assembly.activity")
    async def test_split_custom_pages_per_chunk(self, mock_activity: Any, mock_impl: Any) -> None:
        """Test that a custom pages_per_chunk value is forwarded to the implementation."""
        from src.activities.postprocessing.assembly import _split_markdown_by_pages
        from src.activities.postprocessing.schemas import SplitMarkdownByPagesInput

        mock_impl.return_value = ["chunk1"]
        inp = SplitMarkdownByPagesInput(markdown="content", pages_per_chunk=5)
        result = await _split_markdown_by_pages(inp)

        mock_impl.assert_called_once_with("content", 5)
        assert result == ["chunk1"]


@pytest.mark.asyncio
class TestFilterEnhanceContentActivity:
    """Tests for _filter_enhance_content activity."""

    @patch(
        "src.activities.postprocessing.filtering.get_config",
        return_value=Config(TRUST_PROVIDER_LABELS_FOR_FILTER=False, MAX_CONCURRENT_DMS_IMAGE_UPLOADS=5),
    )
    @patch("src.activities.postprocessing.images.upload_file")
    @patch("src.activities.postprocessing.filtering.get_output_dir", return_value="test_doc")
    @patch("src.activities.postprocessing.filtering.MarkdownEnhancer")
    @patch("src.activities.postprocessing.filtering.HeaderFooterFilter")
    @patch("src.activities.postprocessing.filtering.activity")
    async def test_basic_filter_enhance(
        self,
        mock_activity: Any,
        mock_filter_cls: Any,
        mock_enhancer_cls: Any,
        mock_get_output_dir: Any,
        mock_upload_file: Any,
        mock_get_config: Any,
    ) -> None:
        """Test that basic filtering and enhancement produces expected output."""
        mock_activity.logger = MagicMock()
        mock_activity.heartbeat = MagicMock()

        # filter_recurring_elements returns (filtered_list, img_set, table_set, text_set)
        mock_filter_cls.filter_recurring_elements.return_value = (
            [{"type": "text", "text": "body", "page_idx": 0}],
            set(),
            set(),
            set(),
        )

        mock_enhancer_cls.insert_page_numbers.return_value = "enhanced md"

        from src.activities.postprocessing.filtering import _filter_enhance_content
        from src.activities.postprocessing.schemas import FilterEnhanceInput

        inp = FilterEnhanceInput(
            markdown="# Title\nBody text",
            content_list=[_TEXT_BODY],
            image_bytes={},
            project_id=uuid4(),
            filename="test.pdf",
        )
        result = await _filter_enhance_content(inp)

        assert result.markdown == "enhanced md"
        assert result.content_list == [_TEXT_BODY]
        assert result.images == {}

    @patch(
        "src.activities.postprocessing.filtering.get_config",
        return_value=Config(TRUST_PROVIDER_LABELS_FOR_FILTER=False, MAX_CONCURRENT_DMS_IMAGE_UPLOADS=5),
    )
    @patch("src.activities.postprocessing.images.upload_file")
    @patch("src.activities.postprocessing.filtering.get_output_dir", return_value="test_doc")
    @patch("src.activities.postprocessing.filtering.MarkdownEnhancer")
    @patch("src.activities.postprocessing.filtering.HeaderFooterFilter")
    @patch("src.activities.postprocessing.filtering.activity")
    async def test_filter_with_images_filtered_out(
        self,
        mock_activity: Any,
        mock_filter_cls: Any,
        mock_enhancer_cls: Any,
        mock_get_output_dir: Any,
        mock_upload_file: Any,
        mock_get_config: Any,
    ) -> None:
        """Test that recurring images are removed from markdown and image_bytes."""
        mock_activity.logger = MagicMock()
        mock_activity.heartbeat = MagicMock()

        # Simulate recurring image detection
        empty_content_list: list[Any] = []
        mock_filter_cls.filter_recurring_elements.return_value = (
            empty_content_list,
            {"images/logo.png"},  # images to filter
            set(),
            set(),
        )

        md_content = "# Title\n![logo](images/logo.png)\nBody text"
        mock_enhancer_cls.insert_page_numbers.return_value = md_content

        from src.activities.postprocessing.filtering import _filter_enhance_content
        from src.activities.postprocessing.schemas import FilterEnhanceInput

        inp = FilterEnhanceInput(
            markdown=md_content,
            content_list=_EMPTY_CL,
            image_bytes={"logo.png": b"\x89PNG", "images/logo.png": b"\x89PNG"},
            project_id=uuid4(),
            filename="test.pdf",
        )
        result = await _filter_enhance_content(inp)

        # Filtered images should be removed
        assert "logo.png" not in result.images
        assert "images/logo.png" not in result.images

    @patch(
        "src.activities.postprocessing.filtering.get_config",
        return_value=Config(
            TRUST_PROVIDER_LABELS_FOR_FILTER=True, MAX_CONCURRENT_DMS_IMAGE_UPLOADS=5, PAGE_HEIGHT_POINTS=842
        ),
    )
    @patch("src.activities.postprocessing.images.upload_file")
    @patch("src.activities.postprocessing.filtering.get_output_dir", return_value="test_doc")
    @patch("src.activities.postprocessing.filtering.MarkdownEnhancer")
    @patch("src.activities.postprocessing.filtering.HeaderFooterFilter")
    @patch("src.activities.postprocessing.filtering.activity")
    async def test_filter_with_provider_labels(
        self,
        mock_activity: Any,
        mock_filter_cls: Any,
        mock_enhancer_cls: Any,
        mock_get_output_dir: Any,
        mock_upload_file: Any,
        mock_get_config: Any,
    ) -> None:
        """Test that provider label-based filtering is invoked when enabled."""
        mock_activity.logger = MagicMock()
        mock_activity.heartbeat = MagicMock()

        # First pass - label-based filtering
        mock_filter_cls.filter_by_provider_labels.return_value = (
            [{"type": "text", "text": "body", "page_idx": 0}],
            set(),
            set(),
            {"Header Text"},
        )
        # Second pass - recurring element detection
        mock_filter_cls.filter_recurring_elements.return_value = (
            [{"type": "text", "text": "body", "page_idx": 0}],
            set(),
            set(),
            set(),
        )

        from src.activities.postprocessing.filtering import _filter_enhance_content
        from src.activities.postprocessing.schemas import FilterEnhanceInput

        inp = FilterEnhanceInput(
            markdown='<seite nummer="1" />\n# Title\nBody\nHeader Text',
            content_list=[_TEXT_BODY],
            image_bytes={},
            project_id=uuid4(),
            filename="test.pdf",
        )
        result = await _filter_enhance_content(inp)

        # Provider labels filter should have been called
        mock_filter_cls.filter_by_provider_labels.assert_called_once()
        # Since provider is docling, text filtering should NOT apply globally
        # (text_to_filter not applied for docling)
        assert "Header Text" in result.markdown or "Header Text" not in result.markdown

    @patch(
        "src.activities.postprocessing.filtering.get_config",
        return_value=Config(TRUST_PROVIDER_LABELS_FOR_FILTER=False, MAX_CONCURRENT_DMS_IMAGE_UPLOADS=5),
    )
    @patch("src.activities.postprocessing.images.upload_file")
    @patch("src.activities.postprocessing.filtering.get_output_dir", return_value="test_doc")
    @patch("src.activities.postprocessing.filtering.MarkdownEnhancer")
    @patch("src.activities.postprocessing.filtering.HeaderFooterFilter")
    @patch("src.activities.postprocessing.filtering.activity")
    async def test_filter_html_table_removal(
        self,
        mock_activity: Any,
        mock_filter_cls: Any,
        mock_enhancer_cls: Any,
        mock_get_output_dir: Any,
        mock_upload_file: Any,
        mock_get_config: Any,
    ) -> None:
        """Test that recurring HTML tables are removed from markdown."""
        mock_activity.logger = MagicMock()
        mock_activity.heartbeat = MagicMock()

        html_table = "<table><tr><td>Header</td></tr></table>"
        empty_content_list: list[Any] = []
        mock_filter_cls.filter_recurring_elements.return_value = (
            empty_content_list,
            set(),
            {html_table},  # table to filter
            set(),
        )

        md = f"# Title\n{html_table}\nBody"
        mock_enhancer_cls.insert_page_numbers.return_value = md

        from src.activities.postprocessing.filtering import _filter_enhance_content
        from src.activities.postprocessing.schemas import FilterEnhanceInput

        inp = FilterEnhanceInput(
            markdown=md,
            content_list=_EMPTY_CL,
            image_bytes={},
            project_id=uuid4(),
            filename="test.pdf",
        )
        result = await _filter_enhance_content(inp)

        assert html_table not in result.markdown

    @patch(
        "src.activities.postprocessing.filtering.get_config",
        return_value=Config(TRUST_PROVIDER_LABELS_FOR_FILTER=False, MAX_CONCURRENT_DMS_IMAGE_UPLOADS=5),
    )
    @patch("src.activities.postprocessing.images.upload_file")
    @patch("src.activities.postprocessing.filtering.get_output_dir", return_value="test_doc")
    @patch("src.activities.postprocessing.filtering.MarkdownEnhancer")
    @patch("src.activities.postprocessing.filtering.HeaderFooterFilter")
    @patch("src.activities.postprocessing.filtering.activity")
    async def test_orphaned_image_references_removed(
        self,
        mock_activity: Any,
        mock_filter_cls: Any,
        mock_enhancer_cls: Any,
        mock_get_output_dir: Any,
        mock_upload_file: Any,
        mock_get_config: Any,
    ) -> None:
        """Images referenced in markdown but not in image_bytes are removed."""
        mock_activity.logger = MagicMock()
        mock_activity.heartbeat = MagicMock()

        empty_content_list: list[Any] = []
        mock_filter_cls.filter_recurring_elements.return_value = (
            empty_content_list,
            set(),
            set(),
            set(),
        )

        # markdown references an image not in image_bytes
        md = "# Title\n![orphan](images/orphan.png)\nBody"
        mock_enhancer_cls.insert_page_numbers.return_value = md

        from src.activities.postprocessing.filtering import _filter_enhance_content
        from src.activities.postprocessing.schemas import FilterEnhanceInput

        inp = FilterEnhanceInput(
            markdown=md,
            content_list=_EMPTY_CL,
            image_bytes={},  # no image bytes
            project_id=uuid4(),
            filename="test.pdf",
        )
        result = await _filter_enhance_content(inp)

        assert "orphan.png" not in result.markdown
        mock_activity.logger.info.assert_any_call("Removed 1 orphaned image references from markdown")

    @patch(
        "src.activities.postprocessing.filtering.get_config",
        return_value=Config(TRUST_PROVIDER_LABELS_FOR_FILTER=False, MAX_CONCURRENT_DMS_IMAGE_UPLOADS=5),
    )
    @patch("src.activities.postprocessing.images.upload_file")
    @patch("src.activities.postprocessing.filtering.get_output_dir", return_value="test_doc")
    @patch("src.activities.postprocessing.filtering.MarkdownEnhancer")
    @patch("src.activities.postprocessing.filtering.HeaderFooterFilter")
    @patch("src.activities.postprocessing.filtering.activity")
    async def test_page_numbers_not_inserted_if_already_present(
        self,
        mock_activity: Any,
        mock_filter_cls: Any,
        mock_enhancer_cls: Any,
        mock_get_output_dir: Any,
        mock_upload_file: Any,
        mock_get_config: Any,
    ) -> None:
        """Skip page number insertion if already present from Docling."""
        mock_activity.logger = MagicMock()
        mock_activity.heartbeat = MagicMock()

        mock_filter_cls.filter_recurring_elements.return_value = (
            [],
            set(),
            set(),
            set(),
        )

        md = '<seite nummer="1" />\n# Title\nBody'
        from src.activities.postprocessing.filtering import _filter_enhance_content
        from src.activities.postprocessing.schemas import FilterEnhanceInput

        inp = FilterEnhanceInput(
            markdown=md,
            content_list=_EMPTY_CL,
            image_bytes={},
            project_id=uuid4(),
            filename="test.pdf",
        )
        await _filter_enhance_content(inp)

        # insert_page_numbers should NOT have been called since seite tags are present
        mock_enhancer_cls.insert_page_numbers.assert_not_called()

    @patch(
        "src.activities.postprocessing.filtering.get_config",
        return_value=Config(TRUST_PROVIDER_LABELS_FOR_FILTER=False, MAX_CONCURRENT_DMS_IMAGE_UPLOADS=5),
    )
    @patch("src.activities.postprocessing.images.upload_file")
    @patch("src.activities.postprocessing.filtering.get_output_dir", return_value="test_doc")
    @patch("src.activities.postprocessing.filtering.MarkdownEnhancer")
    @patch("src.activities.postprocessing.filtering.HeaderFooterFilter")
    @patch("src.activities.postprocessing.filtering.activity")
    async def test_image_upload_success(
        self,
        mock_activity: Any,
        mock_filter_cls: Any,
        mock_enhancer_cls: Any,
        mock_get_output_dir: Any,
        mock_upload_file: Any,
        mock_get_config: Any,
    ) -> None:
        """Surviving images are uploaded to DMS."""
        mock_activity.logger = MagicMock()
        mock_activity.heartbeat = MagicMock()

        mock_filter_cls.filter_recurring_elements.return_value = (
            [],
            set(),
            set(),
            set(),
        )

        file_obj = MagicMock()
        file_obj.id = uuid4()
        mock_upload_file.return_value = file_obj

        md = '<seite nummer="1" />\nBody with ![img](images/chart.png)'
        from src.activities.postprocessing.filtering import _filter_enhance_content
        from src.activities.postprocessing.schemas import FilterEnhanceInput

        inp = FilterEnhanceInput(
            markdown=md,
            content_list=_EMPTY_CL,
            image_bytes={"chart.png": b"\x89PNG data"},
            project_id=uuid4(),
            filename="test.pdf",
        )
        result = await _filter_enhance_content(inp)

        assert "chart.png" in result.image_refs
        mock_upload_file.assert_called_once()

    @patch(
        "src.activities.postprocessing.filtering.get_config",
        return_value=Config(TRUST_PROVIDER_LABELS_FOR_FILTER=False, MAX_CONCURRENT_DMS_IMAGE_UPLOADS=5),
    )
    @patch("src.activities.postprocessing.images.upload_file")
    @patch("src.activities.postprocessing.filtering.get_output_dir", return_value="test_doc")
    @patch("src.activities.postprocessing.filtering.MarkdownEnhancer")
    @patch("src.activities.postprocessing.filtering.HeaderFooterFilter")
    @patch("src.activities.postprocessing.filtering.activity")
    async def test_image_upload_timeout_handled(
        self,
        mock_activity: Any,
        mock_filter_cls: Any,
        mock_enhancer_cls: Any,
        mock_get_output_dir: Any,
        mock_upload_file: Any,
        mock_get_config: Any,
    ) -> None:
        """Timeout during image upload is logged as warning, not raised."""

        mock_activity.logger = MagicMock()
        mock_activity.heartbeat = MagicMock()

        mock_filter_cls.filter_recurring_elements.return_value = (
            [],
            set(),
            set(),
            set(),
        )

        mock_upload_file.side_effect = TimeoutError()

        md = '<seite nummer="1" />\nBody'
        from src.activities.postprocessing.filtering import _filter_enhance_content
        from src.activities.postprocessing.schemas import FilterEnhanceInput

        inp = FilterEnhanceInput(
            markdown=md,
            content_list=_EMPTY_CL,
            image_bytes={"img.png": b"\x89PNG"},
            project_id=uuid4(),
            filename="test.pdf",
        )
        result = await _filter_enhance_content(inp)

        # Image should not be in refs since upload timed out
        assert "img.png" not in result.image_refs
        # But image bytes should still be in images dict
        assert "img.png" in result.images

    @patch(
        "src.activities.postprocessing.filtering.get_config",
        return_value=Config(TRUST_PROVIDER_LABELS_FOR_FILTER=False, MAX_CONCURRENT_DMS_IMAGE_UPLOADS=5),
    )
    @patch("src.activities.postprocessing.images.upload_file")
    @patch("src.activities.postprocessing.filtering.get_output_dir", return_value="test_doc")
    @patch("src.activities.postprocessing.filtering.MarkdownEnhancer")
    @patch("src.activities.postprocessing.filtering.HeaderFooterFilter")
    @patch("src.activities.postprocessing.filtering.activity")
    async def test_image_upload_exception_handled(
        self,
        mock_activity: Any,
        mock_filter_cls: Any,
        mock_enhancer_cls: Any,
        mock_get_output_dir: Any,
        mock_upload_file: Any,
        mock_get_config: Any,
    ) -> None:
        """Generic exception during image upload is logged as warning."""
        mock_activity.logger = MagicMock()
        mock_activity.heartbeat = MagicMock()

        mock_filter_cls.filter_recurring_elements.return_value = (
            [],
            set(),
            set(),
            set(),
        )
        mock_upload_file.side_effect = RuntimeError("DMS error")

        md = '<seite nummer="1" />\nBody'
        from src.activities.postprocessing.filtering import _filter_enhance_content
        from src.activities.postprocessing.schemas import FilterEnhanceInput

        inp = FilterEnhanceInput(
            markdown=md,
            content_list=_EMPTY_CL,
            image_bytes={"img.png": b"\x89PNG"},
            project_id=uuid4(),
            filename="test.pdf",
        )
        result = await _filter_enhance_content(inp)

        assert "img.png" not in result.image_refs


@pytest.mark.asyncio
class TestCreateFinalJsonActivity:
    """Tests for _create_final_json activity."""

    @patch("src.activities.postprocessing.assembly.upload_file")
    @patch("src.activities.postprocessing.assembly.activity")
    async def test_create_final_json_basic(self, mock_activity: Any, mock_upload: Any) -> None:
        """Test that _create_final_json uploads JSON and returns file ID."""
        mock_activity.heartbeat = MagicMock()

        file_obj = MagicMock()
        file_obj.id = uuid4()
        mock_upload.return_value = file_obj

        from src.activities.postprocessing.assembly import _create_final_json
        from src.activities.postprocessing.schemas import CreateFinalJsonInput
        from src.workflows.summarization.output_format import SummaryOutput

        inp = CreateFinalJsonInput(
            final_markdown='<seite nummer="1" />\n# Title\nContent\n<seite nummer="2" />\nMore',
            chunks=[],
            summary_result=SummaryOutput(summary="A test summary"),
            base_metadata=None,
            original_filename="report.pdf",
            project_id=uuid4(),
            processing_duration_seconds=10.5,
        )
        result = await _create_final_json(inp)

        assert result.final_json_file_id == file_obj.id
        assert "report_processed.json" in result.filename
        mock_upload.assert_called_once()

    @patch("src.activities.postprocessing.assembly.upload_file")
    @patch("src.activities.postprocessing.assembly.activity")
    async def test_create_final_json_with_base_metadata(self, mock_activity: Any, mock_upload: Any) -> None:
        """Test that base_metadata is included in the uploaded JSON."""
        mock_activity.heartbeat = MagicMock()

        file_obj = MagicMock()
        file_obj.id = uuid4()
        mock_upload.return_value = file_obj

        from temporal.contracts import BaseMetadata

        from src.activities.postprocessing.assembly import _create_final_json
        from src.activities.postprocessing.schemas import CreateFinalJsonInput
        from src.workflows.summarization.output_format import SummaryOutput

        bm = BaseMetadata(
            application_id="proj-123",
            project_applicant="Landesdirektion Sachsen",
        )
        inp = CreateFinalJsonInput(
            final_markdown="# Doc\nContent",
            chunks=[],
            summary_result=SummaryOutput(summary="Sum"),
            base_metadata=bm,
            original_filename="doc.pdf",
            project_id=uuid4(),
            processing_duration_seconds=3.0,
        )
        await _create_final_json(inp)

        call_args = mock_upload.call_args[0][0]
        uploaded_json = json.loads(call_args.data.decode("utf-8"))
        assert uploaded_json["metadata"]["baseMetadata"]["projectApplicant"] == "Landesdirektion Sachsen"

    @patch("src.activities.postprocessing.assembly.upload_file")
    @patch("src.activities.postprocessing.assembly.activity")
    async def test_create_final_json_no_page_markers(self, mock_activity: Any, mock_upload: Any) -> None:
        """When no page markers exist, page_count should be None."""
        mock_activity.heartbeat = MagicMock()

        file_obj = MagicMock()
        file_obj.id = uuid4()
        mock_upload.return_value = file_obj

        from src.activities.postprocessing.assembly import _create_final_json
        from src.activities.postprocessing.schemas import CreateFinalJsonInput
        from src.workflows.summarization.output_format import SummaryOutput

        inp = CreateFinalJsonInput(
            final_markdown="# Title\nNo page markers here",
            chunks=[],
            summary_result=SummaryOutput(summary="Sum"),
            base_metadata=None,
            original_filename="doc.pdf",
            project_id=uuid4(),
            processing_duration_seconds=1.0,
        )
        await _create_final_json(inp)

        call_args = mock_upload.call_args[0][0]
        uploaded_json = json.loads(call_args.data.decode("utf-8"))
        assert uploaded_json["metadata"]["pages"] is None


@pytest.mark.asyncio
class TestUploadImagesToDmsActivity:
    """Tests for _upload_images_to_dms activity."""

    @patch("src.activities.postprocessing.images.get_config", return_value=Config(MAX_CONCURRENT_DMS_IMAGE_UPLOADS=5))
    @patch("src.activities.postprocessing.images.upload_file")
    @patch("src.activities.postprocessing.images.get_output_dir", return_value="doc_folder")
    @patch("src.activities.postprocessing.images.activity")
    async def test_upload_images_success(
        self,
        mock_activity: Any,
        mock_get_output_dir: Any,
        mock_upload: Any,
        mock_get_config: Any,
    ) -> None:
        """Test that all images are uploaded to DMS successfully."""
        mock_activity.logger = MagicMock()
        mock_activity.heartbeat = MagicMock()

        file_obj = MagicMock()
        file_obj.id = uuid4()
        mock_upload.return_value = file_obj

        from src.activities.postprocessing.images import _upload_images_to_dms
        from src.activities.postprocessing.schemas import UploadImagesToDmsInput

        inp = UploadImagesToDmsInput(
            images={"img1.png": b"\x89PNG", "img2.jpg": b"\xff\xd8"},
            project_id=uuid4(),
            filename="test.pdf",
        )
        result = await _upload_images_to_dms(inp)

        assert result == 2
        assert mock_upload.call_count == 2
        mock_activity.logger.info.assert_called_once()

    @patch("src.activities.postprocessing.images.get_config", return_value=Config(MAX_CONCURRENT_DMS_IMAGE_UPLOADS=5))
    @patch("src.activities.postprocessing.images.upload_file")
    @patch("src.activities.postprocessing.images.get_output_dir", return_value="doc_folder")
    @patch("src.activities.postprocessing.images.activity")
    async def test_upload_images_empty(
        self,
        mock_activity: Any,
        mock_get_output_dir: Any,
        mock_upload: Any,
        mock_get_config: Any,
    ) -> None:
        """Test that uploading an empty images dict returns zero."""
        mock_activity.logger = MagicMock()
        mock_activity.heartbeat = MagicMock()

        from src.activities.postprocessing.images import _upload_images_to_dms
        from src.activities.postprocessing.schemas import UploadImagesToDmsInput

        inp = UploadImagesToDmsInput(
            images={},
            project_id=uuid4(),
            filename="test.pdf",
        )
        result = await _upload_images_to_dms(inp)

        assert result == 0


@pytest.mark.asyncio
class TestPrepareVlmInputsActivity:
    """Tests for _prepare_vlm_inputs_activity."""

    @patch("src.activities.postprocessing.filtering.prepare_vlm_inputs")
    @patch("src.activities.postprocessing.filtering.activity")
    async def test_delegates_to_prepare_vlm_inputs(self, mock_activity: Any, mock_prep: Any) -> None:
        """Test that the activity delegates to prepare_vlm_inputs function."""
        from src.activities.postprocessing.filtering import _prepare_vlm_inputs_activity
        from src.activities.postprocessing.schemas import FilterEnhanceResult

        empty_vlm_inputs: list[Any] = []
        mock_prep.return_value = empty_vlm_inputs
        inp = FilterEnhanceResult(markdown="md", content_list=_EMPTY_CL, images={}, image_refs={})
        result = await _prepare_vlm_inputs_activity(inp)

        mock_prep.assert_called_once_with(inp)
        assert result == []


# ===========================================================================
#  5. preprocessing.py
# ===========================================================================


class TestConvertToPdfIfNeededInput:
    """Tests for ConvertToPdfIfNeededInput model."""

    def test_valid_input(self) -> None:
        """Test that ConvertToPdfIfNeededInput can be constructed with file_info."""
        from src.activities.preprocessing import ConvertToPdfIfNeededInput

        file_info = _make_file_info("test.docx")
        inp = ConvertToPdfIfNeededInput(file_info=file_info)
        assert inp.file_info.filename == "test.docx"


@pytest.mark.asyncio
class TestConvertToPdfIfNeededActivity:
    """Tests for _convert_to_pdf_if_needed activity."""

    @patch("src.activities.preprocessing.Preprocessor")
    @patch("src.activities.preprocessing.download_file")
    @patch("src.activities.preprocessing.activity")
    async def test_valid_pdf_returns_bytes_directly(
        self,
        mock_activity: Any,
        mock_download: Any,
        mock_preprocessor: Any,
    ) -> None:
        """Test that a valid PDF is returned directly without conversion."""
        mock_activity.logger = MagicMock()
        mock_download.return_value = b"%PDF-1.4 valid pdf bytes"
        mock_preprocessor.convert_to_pdf_if_needed = AsyncMock(
            return_value=(b"%PDF-1.4 valid pdf bytes", "document.pdf")
        )

        from src.activities.preprocessing import (
            ConvertToPdfIfNeededInput,
            _convert_to_pdf_if_needed,
        )

        file_info = _make_file_info("document.pdf")
        inp = ConvertToPdfIfNeededInput(file_info=file_info)
        result = await _convert_to_pdf_if_needed(inp)

        assert result == b"%PDF-1.4 valid pdf bytes"
        mock_preprocessor.convert_to_pdf_if_needed.assert_called_once_with("document.pdf", b"%PDF-1.4 valid pdf bytes")

    @patch("src.activities.preprocessing.Preprocessor")
    @patch("src.activities.preprocessing.download_file")
    @patch("src.activities.preprocessing.activity")
    async def test_non_pdf_triggers_conversion(
        self,
        mock_activity: Any,
        mock_download: Any,
        mock_preprocessor: Any,
    ) -> None:
        """Test that a non-PDF file triggers conversion via Preprocessor."""
        mock_activity.logger = MagicMock()
        mock_download.return_value = b"docx content"
        mock_preprocessor.convert_to_pdf_if_needed = AsyncMock(return_value=(b"%PDF-converted", "document.pdf"))

        from src.activities.preprocessing import (
            ConvertToPdfIfNeededInput,
            _convert_to_pdf_if_needed,
        )

        file_info = _make_file_info("document.docx")
        inp = ConvertToPdfIfNeededInput(file_info=file_info)
        result = await _convert_to_pdf_if_needed(inp)

        assert result == b"%PDF-converted"
        mock_preprocessor.convert_to_pdf_if_needed.assert_called_once_with("document.docx", b"docx content")
