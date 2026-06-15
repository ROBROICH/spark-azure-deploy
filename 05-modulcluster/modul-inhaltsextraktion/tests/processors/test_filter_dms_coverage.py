"""
Comprehensive coverage tests for:
- src/processors/filter.py (uncovered lines: label-based filtering, recurring element edge cases)
- src/utils/dms_utils.py (uncovered lines: upload_file error handling, delete_file, list_files)
- src/providers/docling/api_client.py (uncovered lines: __init__, convert_document)
"""

from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import httpx
import imagehash
import pytest

# ============================================================================
# 1. filter.py - HeaderFooterFilter: label-based & recurring element coverage
# ============================================================================
from src.processors.header_footer_filter import HeaderFooterFilter
from src.providers.base import ContentItemDict


class TestFilterByProviderLabels:
    """Tests for filter_by_provider_labels to cover lines 88-134."""

    def test_filters_page_header_label(self) -> None:
        """Elements with 'page_header' label are removed."""
        content_list: list[ContentItemDict] = [
            {"type": "text", "text": "Header Text", "label": "page_header", "page_idx": 0},
            {"type": "text", "text": "Body Text", "label": "paragraph", "page_idx": 0},
        ]
        filtered, images, tables, texts = HeaderFooterFilter.filter_by_provider_labels(content_list)
        assert len(filtered) == 1
        assert filtered[0].get("text") == "Body Text"
        assert "Header Text" in texts

    def test_filters_page_footer_label(self) -> None:
        """Elements with 'page_footer' label are removed."""
        content_list: list[ContentItemDict] = [
            {"type": "text", "text": "Body Text", "label": "paragraph", "page_idx": 0},
            {"type": "text", "text": "Footer Text", "label": "page_footer", "page_idx": 0},
        ]
        filtered, images, tables, texts = HeaderFooterFilter.filter_by_provider_labels(content_list)
        assert len(filtered) == 1
        assert filtered[0].get("text") == "Body Text"
        assert "Footer Text" in texts

    def test_filters_hyphenated_labels(self) -> None:
        """Elements with 'page-header' and 'page-footer' labels are removed."""
        content_list: list[ContentItemDict] = [
            {"type": "text", "text": "Header", "label": "page-header", "page_idx": 0},
            {"type": "text", "text": "Footer", "label": "page-footer", "page_idx": 0},
            {"type": "text", "text": "Body", "label": "text", "page_idx": 0},
        ]
        filtered, images, tables, texts = HeaderFooterFilter.filter_by_provider_labels(content_list)
        assert len(filtered) == 1
        assert filtered[0].get("text") == "Body"

    def test_filters_furniture_content_layer(self) -> None:
        """Elements with content_layer='furniture' are removed."""
        # content_layer is only defined on ContentItemImage, so we use image type here.
        content_list: list[ContentItemDict] = [
            {"type": "image", "page_idx": 0, "label": "", "content_layer": "furniture"},
            {"type": "text", "text": "Body", "label": "paragraph", "page_idx": 0},
        ]
        filtered, images, tables, texts = HeaderFooterFilter.filter_by_provider_labels(content_list)
        assert len(filtered) == 1
        assert filtered[0].get("text") == "Body"
        # Image-type elements go into images set, not texts
        assert len(images) == 0  # No img_path on the filtered element

    def test_filters_image_with_furniture_label(self) -> None:
        """Image elements with furniture labels have their img_path recorded."""
        content_list: list[ContentItemDict] = [
            {
                "type": "image",
                "img_path": "logo.png",
                "label": "page_header",
                "page_idx": 0,
            },
            {"type": "text", "text": "Body", "label": "paragraph", "page_idx": 0},
        ]
        filtered, images, tables, texts = HeaderFooterFilter.filter_by_provider_labels(content_list)
        assert len(filtered) == 1
        assert "logo.png" in images
        assert len(tables) == 0

    def test_filters_table_with_furniture_label(self) -> None:
        """Table elements with furniture labels have their table_body recorded."""
        content_list: list[ContentItemDict] = [
            {
                "type": "table",
                "table_body": "<table><tr><td>Header</td></tr></table>",
                "img_path": "table.png",
                "label": "page_footer",
                "page_idx": 0,
            },
            {"type": "text", "text": "Body", "label": "paragraph", "page_idx": 0},
        ]
        filtered, images, tables, texts = HeaderFooterFilter.filter_by_provider_labels(content_list)
        assert len(filtered) == 1
        assert "table.png" in images
        assert "<table><tr><td>Header</td></tr></table>" in tables

    def test_no_furniture_elements(self) -> None:
        """When no furniture elements found, logs info and returns full list."""
        content_list: list[ContentItemDict] = [
            {"type": "text", "text": "Body1", "label": "paragraph", "page_idx": 0},
            {"type": "text", "text": "Body2", "label": "paragraph", "page_idx": 0},
        ]
        filtered, images, tables, texts = HeaderFooterFilter.filter_by_provider_labels(content_list)
        assert len(filtered) == 2
        assert len(images) == 0
        assert len(tables) == 0
        assert len(texts) == 0

    def test_empty_content_list(self) -> None:
        """Empty content list returns empty results."""
        filtered, images, tables, texts = HeaderFooterFilter.filter_by_provider_labels([])
        assert filtered == []
        assert images == set()
        assert tables == set()
        assert texts == set()

    def test_elements_with_missing_label_field(self) -> None:
        """Elements without label or content_layer fields are not filtered."""
        content_list: list[ContentItemDict] = [
            {"type": "text", "text": "No label", "page_idx": 0},
            {"type": "text", "text": "Empty label", "label": "", "page_idx": 0},
        ]
        filtered, images, tables, texts = HeaderFooterFilter.filter_by_provider_labels(content_list)
        assert len(filtered) == 2

    def test_img_type_as_furniture(self) -> None:
        """'img' type elements with furniture labels have their img_path recorded."""
        # Use "image" type (the valid union member) to test furniture filtering.
        # The filter also handles "img" at runtime via .get(), but the TypedDict
        # union only defines "image".
        content_list: list[ContentItemDict] = [
            {
                "type": "image",
                "img_path": "icon.png",
                "label": "page_header",
                "page_idx": 0,
            },
        ]
        filtered, images, tables, texts = HeaderFooterFilter.filter_by_provider_labels(content_list)
        assert len(filtered) == 0
        assert "icon.png" in images

    def test_case_insensitive_label_matching(self) -> None:
        """Label matching is case-insensitive."""
        content_list: list[ContentItemDict] = [
            {"type": "text", "text": "Upper", "label": "PAGE_HEADER", "page_idx": 0},
            {"type": "text", "text": "Mixed", "label": "Page_Footer", "page_idx": 0},
        ]
        filtered, images, tables, texts = HeaderFooterFilter.filter_by_provider_labels(content_list)
        assert len(filtered) == 0
        assert "Upper" in texts
        assert "Mixed" in texts

    def test_case_insensitive_content_layer_matching(self) -> None:
        """Content layer matching is case-insensitive."""
        # content_layer is defined on ContentItemImage, so use image type
        content_list: list[ContentItemDict] = [
            {"type": "image", "page_idx": 0, "label": "", "content_layer": "Furniture"},
        ]
        filtered, images, tables, texts = HeaderFooterFilter.filter_by_provider_labels(content_list)
        assert len(filtered) == 0


# ============================================================================
# 1b. filter.py - find_duplicate_images edge cases (lines 179, 185-186, 200-201)
# ============================================================================


class TestFindDuplicateImagesEdgeCases:
    """Additional edge cases for find_duplicate_images."""

    def test_image_bytes_not_found(self) -> None:
        """When image bytes are not in the dict, the image is skipped."""
        content_list: list[ContentItemDict] = [
            {"type": "image", "img_path": "missing.png", "page_idx": 0, "bbox": [0, 0, 50, 50]},
            {"type": "image", "img_path": "also_missing.png", "page_idx": 1, "bbox": [0, 0, 50, 50]},
        ]
        # No bytes for these images
        image_bytes: dict[str, bytes] = {}
        result = HeaderFooterFilter.find_duplicate_images(content_list, image_bytes)
        assert result == set()

    def test_image_open_raises_exception(self) -> None:
        """When PIL cannot open image data, warning is logged and image is skipped."""
        content_list: list[ContentItemDict] = [
            {"type": "image", "img_path": "corrupt.png", "page_idx": 0, "bbox": [0, 0, 50, 50]},
            {"type": "image", "img_path": "good.png", "page_idx": 1, "bbox": [0, 0, 50, 50]},
        ]
        image_bytes = {
            "corrupt.png": b"not-a-valid-image",
            "good.png": b"also-not-valid",
        }
        # PIL.Image.open will fail on invalid data -> logged as warning and skipped
        with patch("src.processors.header_footer_filter.Image.open", side_effect=Exception("bad image")):
            result = HeaderFooterFilter.find_duplicate_images(content_list, image_bytes)
        assert result == set()

    def test_images_prefix_resolution(self) -> None:
        """Images with 'images/' prefix are resolved to plain filename in bytes dict."""
        content_list: list[ContentItemDict] = [
            {"type": "image", "img_path": "images/logo.png", "page_idx": 0, "bbox": [0, 0, 50, 50]},
            {"type": "image", "img_path": "images/logo2.png", "page_idx": 1, "bbox": [0, 0, 50, 50]},
        ]
        image_bytes = {"logo.png": b"data1", "logo2.png": b"data2"}
        same_hash = imagehash.hex_to_hash("f" * 16)

        with patch("src.processors.header_footer_filter.Image.open") as mock_open:
            mock_open.return_value.__enter__ = MagicMock(return_value=MagicMock())
            mock_open.return_value.__exit__ = MagicMock(return_value=False)
            with patch("src.processors.header_footer_filter.imagehash.phash", side_effect=[same_hash, same_hash]):
                result = HeaderFooterFilter.find_duplicate_images(content_list, image_bytes)
        assert "images/logo2.png" in result
        assert "images/logo.png" not in result

    def test_element_with_no_img_path_skipped(self) -> None:
        """Elements with img_path=None are skipped in the inner loop (line 179)."""
        # Elements without img_path (not provided) are skipped
        content_list: list[ContentItemDict] = [
            {"type": "image", "page_idx": 0},
            {"type": "image", "page_idx": 1},
        ]
        image_bytes: dict[str, bytes] = {}
        result = HeaderFooterFilter.find_duplicate_images(content_list, image_bytes)
        assert result == set()


# ============================================================================
# 1c. filter.py - filter_recurring_elements edge cases (lines 319-440)
# ============================================================================


class TestFilterRecurringElementsEdgeCases:
    """Edge cases for filter_recurring_elements to hit uncovered lines."""

    def test_table_with_table_body_in_header_zone(self) -> None:
        """Tables with table_body in header zone use HTML hash for grouping (lines 369-372)."""
        table_body = "<table><tr><td>Summary</td></tr></table>"
        content_list: list[ContentItemDict] = [
            {
                "type": "table",
                "table_body": table_body,
                "bbox": [0, 0, 100, 50],  # In header zone
                "page_idx": 0,
            },
            {
                "type": "table",
                "table_body": table_body,
                "bbox": [0, 0, 100, 50],
                "page_idx": 1,
            },
            {
                "type": "table",
                "table_body": table_body,
                "bbox": [0, 0, 100, 50],
                "page_idx": 2,
            },
        ]
        images: dict[str, bytes] = {}
        filtered, img_f, table_f, text_f = HeaderFooterFilter.filter_recurring_elements(
            content_list, images, page_height=1000, occurrence_threshold=2
        )
        # First table kept, other two filtered
        assert len(filtered) == 1
        assert table_body in table_f

    def test_text_with_empty_stripped_content_in_header_zone(self) -> None:
        """Text elements with empty stripped content in header zone are skipped (line 383)."""
        content_list: list[ContentItemDict] = [
            {
                "type": "text",
                "text": "   ",  # Whitespace only
                "bbox": [0, 0, 100, 50],  # In header zone
                "page_idx": 0,
            },
            {
                "type": "text",
                "text": "   ",
                "bbox": [0, 0, 100, 50],
                "page_idx": 1,
            },
        ]
        images: dict[str, bytes] = {}
        filtered, img_f, table_f, text_f = HeaderFooterFilter.filter_recurring_elements(
            content_list, images, page_height=1000
        )
        # Empty text shouldn't be grouped for filtering
        assert len(filtered) == 2

    def test_normalized_text_differs_from_original(self) -> None:
        """Text with page numbers gets normalized matching (line 391)."""
        content_list: list[ContentItemDict] = [
            {
                "type": "text",
                "text": "Page 1",
                "bbox": [0, 0, 100, 50],  # header zone
                "page_idx": 0,
            },
            {
                "type": "text",
                "text": "Page 2",
                "bbox": [0, 0, 100, 50],
                "page_idx": 1,
            },
            {
                "type": "text",
                "text": "Page 3",
                "bbox": [0, 0, 100, 50],
                "page_idx": 2,
            },
        ]
        images: dict[str, bytes] = {}
        filtered, img_f, table_f, text_f = HeaderFooterFilter.filter_recurring_elements(
            content_list, images, page_height=1000, occurrence_threshold=2
        )
        # "Page 1", "Page 2", "Page 3" normalize to "Page " so 2 get filtered
        assert len(filtered) == 1
        assert len(text_f) == 2

    def test_group_below_occurrence_threshold_not_filtered(self) -> None:
        """Groups below occurrence threshold are not filtered (line 404)."""
        content_list: list[ContentItemDict] = [
            {
                "type": "text",
                "text": "Once header",
                "bbox": [0, 0, 100, 50],
                "page_idx": 0,
            },
            {
                "type": "text",
                "text": "Body content",
                "bbox": [0, 200, 100, 300],
                "page_idx": 0,
            },
        ]
        images: dict[str, bytes] = {}
        filtered, img_f, table_f, text_f = HeaderFooterFilter.filter_recurring_elements(
            content_list, images, page_height=1000, occurrence_threshold=2
        )
        # Single occurrence, not enough to filter
        assert len(filtered) == 2

    def test_no_recurring_elements_found(self) -> None:
        """When no recurring elements are detected, returns unmodified list (lines 424-425)."""
        content_list: list[ContentItemDict] = [
            {
                "type": "text",
                "text": "Header A",
                "bbox": [0, 0, 100, 50],
                "page_idx": 0,
            },
            {
                "type": "text",
                "text": "Header B",
                "bbox": [0, 0, 100, 50],
                "page_idx": 1,
            },
        ]
        images: dict[str, bytes] = {}
        # occurrence_threshold=3 means we need 3+ to filter; only 1 of each exists
        filtered, img_f, table_f, text_f = HeaderFooterFilter.filter_recurring_elements(
            content_list, images, page_height=1000, occurrence_threshold=3
        )
        assert len(filtered) == 2
        assert img_f == set()
        assert table_f == set()
        assert text_f == set()

    def test_table_element_filtered_collects_table_body_and_img_path(self) -> None:
        """Filtered table elements collect both img_path and table_body (line 440)."""
        content_list: list[ContentItemDict] = [
            {
                "type": "table",
                "table_body": "<table>A</table>",
                "img_path": "table0.png",
                "bbox": [0, 0, 100, 50],
                "page_idx": 0,
            },
            {
                "type": "table",
                "table_body": "<table>A</table>",
                "img_path": "table1.png",
                "bbox": [0, 0, 100, 50],
                "page_idx": 1,
            },
            {
                "type": "table",
                "table_body": "<table>A</table>",
                "img_path": "table2.png",
                "bbox": [0, 0, 100, 50],
                "page_idx": 2,
            },
        ]
        images: dict[str, bytes] = {}
        filtered, img_f, table_f, text_f = HeaderFooterFilter.filter_recurring_elements(
            content_list, images, page_height=1000, occurrence_threshold=2
        )
        assert len(filtered) == 1
        # Both table_body and img_path of filtered elements are collected
        assert len(img_f) >= 1
        assert "<table>A</table>" in table_f

    def test_image_in_header_zone_with_missing_bytes(self) -> None:
        """Images in header/footer zone with no bytes in dict log debug and skip (line 326-327)."""
        content_list: list[ContentItemDict] = [
            {
                "type": "image",
                "img_path": "missing_img.png",
                "bbox": [0, 0, 100, 50],  # header zone
                "page_idx": 0,
            },
            {
                "type": "image",
                "img_path": "missing_img2.png",
                "bbox": [0, 0, 100, 50],
                "page_idx": 1,
            },
        ]
        images: dict[str, bytes] = {}  # No bytes available
        filtered, img_f, table_f, text_f = HeaderFooterFilter.filter_recurring_elements(
            content_list, images, page_height=1000
        )
        # Can't hash images -> no filtering
        assert len(filtered) == 2

    def test_image_open_exception_in_recurring_filter(self) -> None:
        """When image processing fails in recurring filter, warning logged and skipped (line 343)."""
        content_list: list[ContentItemDict] = [
            {
                "type": "image",
                "img_path": "bad.png",
                "bbox": [0, 0, 100, 50],
                "page_idx": 0,
            },
            {
                "type": "image",
                "img_path": "bad2.png",
                "bbox": [0, 0, 100, 50],
                "page_idx": 1,
            },
        ]
        images: dict[str, bytes] = {"bad.png": b"corrupt", "bad2.png": b"corrupt"}
        with patch("src.processors.header_footer_filter.Image.open", side_effect=Exception("corrupt")):
            filtered, img_f, table_f, text_f = HeaderFooterFilter.filter_recurring_elements(
                content_list, images, page_height=1000
            )
        assert len(filtered) == 2

    def test_sort_error_in_group_indices(self) -> None:
        """Sort error in group indices logs a warning and skips the group (header_footer_filter.py:243-245)."""
        # Both items have valid bboxes in the header zone so they pass _collect_candidate_elements.
        # Mixed page_idx types (int vs str) cause a TypeError during tuple comparison in sorted(),
        # hitting the except branch. The group is skipped → nothing filtered.
        content_list_bad: list[ContentItemDict] = [
            {"type": "text", "text": "Recurring Header", "bbox": [0, 10, 100, 50], "page_idx": 0},
            {"type": "text", "text": "Recurring Header", "bbox": [0, 10, 100, 50], "page_idx": "bad"},
        ]
        with patch("src.processors.header_footer_filter._get_logger") as mock_log:
            mock_logger = MagicMock()
            mock_log.return_value = mock_logger
            filtered, _, _, _ = HeaderFooterFilter.filter_recurring_elements(
                content_list_bad, {}, page_height=1000, occurrence_threshold=2
            )
        # Group skipped on sort error → both items remain
        assert len(filtered) == 2
        mock_logger.warning.assert_called_once()

    def test_footer_zone_text_filtering(self) -> None:
        """Text in footer zone is detected and filtered."""
        content_list: list[ContentItemDict] = [
            {
                "type": "text",
                "text": "Footer note",
                "bbox": [0, 950, 100, 990],  # In footer zone (bottom 18%)
                "page_idx": 0,
            },
            {
                "type": "text",
                "text": "Footer note",
                "bbox": [0, 950, 100, 990],
                "page_idx": 1,
            },
            {
                "type": "text",
                "text": "Body content",
                "bbox": [0, 300, 100, 400],
                "page_idx": 0,
            },
        ]
        images: dict[str, bytes] = {}
        filtered, img_f, table_f, text_f = HeaderFooterFilter.filter_recurring_elements(
            content_list, images, page_height=1000, occurrence_threshold=2
        )
        assert len(filtered) == 2  # First footer note + body content
        assert "Footer note" in text_f

    def test_empty_table_body_not_hashed(self) -> None:
        """Table with empty table_body after strip falls through to image processing."""
        content_list: list[ContentItemDict] = [
            {
                "type": "table",
                "table_body": "   ",  # Only whitespace
                "img_path": "t1.png",
                "bbox": [0, 0, 100, 50],
                "page_idx": 0,
            },
            {
                "type": "table",
                "table_body": "   ",
                "img_path": "t2.png",
                "bbox": [0, 0, 100, 50],
                "page_idx": 1,
            },
        ]
        images: dict[str, bytes] = {"t1.png": b"data1", "t2.png": b"data2"}
        same_hash = imagehash.hex_to_hash("f" * 16)

        with patch("src.processors.header_footer_filter.Image.open") as mock_open:
            mock_open.return_value.__enter__ = MagicMock(return_value=MagicMock())
            mock_open.return_value.__exit__ = MagicMock(return_value=False)
            with patch("src.processors.header_footer_filter.imagehash.phash", side_effect=[same_hash, same_hash]):
                filtered, img_f, table_f, text_f = HeaderFooterFilter.filter_recurring_elements(
                    content_list, images, page_height=1000, occurrence_threshold=2
                )
        # Two tables with same image hash -> one filtered
        assert len(filtered) == 1


# ============================================================================
# 2. dms_utils.py - upload_file error handling, delete_file, list_files
# ============================================================================

from src.utils.dms_utils import (  # noqa: E402
    DmsUploadInput,
    ListFilesInput,
    _json_default,
    delete_file,
    list_files,
    upload_file,
)


class TestJsonDefault:
    """Test _json_default serializer helper."""

    def test_uuid_serialization(self) -> None:
        """Test that UUIDs are serialized to their string representation."""
        uid = UUID("12345678-1234-5678-1234-567812345678")
        result = _json_default(uid)
        assert result == "12345678-1234-5678-1234-567812345678"

    def test_datetime_serialization(self) -> None:
        """Test that datetimes are serialized to ISO format strings."""
        dt = datetime(2024, 1, 15, 10, 30, 0)
        result = _json_default(dt)
        assert result == "2024-01-15T10:30:00"

    def test_unsupported_type_raises(self) -> None:
        """Test that unsupported types raise TypeError."""
        with pytest.raises(TypeError, match="not JSON serializable"):
            _json_default(set())


class TestUploadFileErrorPaths:
    """Tests for upload_file covering error handling on lines 75-79 (status >= 400)."""

    @pytest.mark.asyncio
    async def test_upload_file_generate_url_error(self) -> None:
        """upload_file logs error and raises when generate-upload-url returns 400+."""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Server Error", request=MagicMock(), response=mock_response
        )

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("src.utils.dms_utils._get_client", return_value=mock_client):
            with pytest.raises(RuntimeError, match="DMS upload failed"):
                await upload_file(
                    DmsUploadInput(
                        data=b"test data",
                        filename="test.json",
                        project_id=UUID("12345678-1234-5678-1234-567812345678"),
                    )
                )

    @pytest.mark.asyncio
    async def test_upload_file_signed_url_upload_error(self) -> None:
        """upload_file logs error when signed URL PUT returns 400+."""
        # Step 1 succeeds
        mock_gen_response = MagicMock()
        mock_gen_response.status_code = 200
        mock_gen_response.json.return_value = {"uploadUrl": "https://signed-url.example.com"}
        mock_gen_response.raise_for_status = MagicMock()

        # Step 2 fails
        mock_upload_response = MagicMock()
        mock_upload_response.status_code = 403
        mock_upload_response.text = "Forbidden"
        mock_upload_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Forbidden", request=MagicMock(), response=mock_upload_response
        )

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_gen_response)
        mock_client.put = AsyncMock(return_value=mock_upload_response)

        with patch("src.utils.dms_utils._get_client", return_value=mock_client):
            with pytest.raises(RuntimeError, match="DMS upload failed"):
                await upload_file(
                    DmsUploadInput(
                        data=b"test data",
                        filename="test.json",
                        project_id=UUID("12345678-1234-5678-1234-567812345678"),
                    )
                )

    @pytest.mark.asyncio
    async def test_upload_file_confirm_upload_error(self) -> None:
        """upload_file logs error when confirm-upload returns 400+."""
        # Step 1 succeeds
        mock_gen_response = MagicMock()
        mock_gen_response.status_code = 200
        mock_gen_response.json.return_value = {"uploadUrl": "https://signed-url.example.com"}
        mock_gen_response.raise_for_status = MagicMock()

        # Step 2 succeeds
        mock_upload_response = MagicMock()
        mock_upload_response.status_code = 200
        mock_upload_response.raise_for_status = MagicMock()

        # Step 3 fails
        mock_confirm_response = MagicMock()
        mock_confirm_response.status_code = 400
        mock_confirm_response.text = "Bad Request"
        mock_confirm_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Bad Request", request=MagicMock(), response=mock_confirm_response
        )

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=[mock_gen_response, mock_confirm_response])
        mock_client.put = AsyncMock(return_value=mock_upload_response)

        with patch("src.utils.dms_utils._get_client", return_value=mock_client):
            with pytest.raises(RuntimeError, match="DMS upload failed"):
                await upload_file(
                    DmsUploadInput(
                        data=b"test data",
                        filename="test.json",
                        project_id=UUID("12345678-1234-5678-1234-567812345678"),
                    )
                )

    @pytest.mark.asyncio
    async def test_upload_file_success(self) -> None:
        """upload_file completes all 3 steps successfully."""
        now = datetime.now().isoformat()
        file_obj_data = {
            "id": "12345678-1234-5678-1234-567812345678",
            "type": "content_extraction",
            "filename": "test.json",
            "mimeType": "application/json",
            "bucketPath": "projects/123/content_extraction/test.json",
            "createdAt": now,
            "updatedAt": now,
        }

        mock_gen_response = MagicMock()
        mock_gen_response.status_code = 200
        mock_gen_response.json.return_value = {"uploadUrl": "https://signed-url.example.com"}
        mock_gen_response.raise_for_status = MagicMock()

        mock_upload_response = MagicMock()
        mock_upload_response.status_code = 200
        mock_upload_response.raise_for_status = MagicMock()

        mock_confirm_response = MagicMock()
        mock_confirm_response.status_code = 200
        mock_confirm_response.json.return_value = file_obj_data
        mock_confirm_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=[mock_gen_response, mock_confirm_response])
        mock_client.put = AsyncMock(return_value=mock_upload_response)

        with patch("src.utils.dms_utils._get_client", return_value=mock_client):
            result = await upload_file(
                DmsUploadInput(
                    data=b"test data",
                    filename="test.json",
                    project_id=UUID("12345678-1234-5678-1234-567812345678"),
                )
            )
        assert result.filename == "test.json"
        assert result.type == "content_extraction"

    @pytest.mark.asyncio
    async def test_upload_file_with_extra_params(self) -> None:
        """upload_file includes extra_params in the payload."""
        now = datetime.now().isoformat()
        file_obj_data = {
            "id": "12345678-1234-5678-1234-567812345678",
            "type": "content_extraction",
            "filename": "test.json",
            "mimeType": "application/json",
            "bucketPath": "projects/123/content_extraction/test.json",
            "createdAt": now,
            "updatedAt": now,
        }

        mock_gen_response = MagicMock()
        mock_gen_response.status_code = 200
        mock_gen_response.json.return_value = {"uploadUrl": "https://signed-url.example.com"}
        mock_gen_response.raise_for_status = MagicMock()

        mock_upload_response = MagicMock()
        mock_upload_response.status_code = 200
        mock_upload_response.raise_for_status = MagicMock()

        mock_confirm_response = MagicMock()
        mock_confirm_response.status_code = 200
        mock_confirm_response.json.return_value = file_obj_data
        mock_confirm_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=[mock_gen_response, mock_confirm_response])
        mock_client.put = AsyncMock(return_value=mock_upload_response)

        with patch("src.utils.dms_utils._get_client", return_value=mock_client):
            result = await upload_file(
                DmsUploadInput(
                    data=b"test data",
                    filename="test.json",
                    project_id=UUID("12345678-1234-5678-1234-567812345678"),
                    extra_params={"workflowId": "wf-123"},
                )
            )
        assert result.filename == "test.json"


class TestDeleteFileCoverage:
    """Tests for delete_file covering lines 191-207."""

    @pytest.mark.asyncio
    async def test_delete_file_http_error_raises(self) -> None:
        """delete_file raises on non-404 HTTP errors."""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Server Error", request=MagicMock(), response=mock_response
        )

        mock_client = AsyncMock()
        mock_client.delete = AsyncMock(return_value=mock_response)

        with patch("src.utils.dms_utils._get_client", return_value=mock_client):
            with pytest.raises(httpx.HTTPStatusError):
                await delete_file(UUID("12345678-1234-5678-1234-567812345678"))


class TestListFilesCoverage:
    """Tests for list_files covering lines 222-276."""

    @pytest.mark.asyncio
    async def test_list_files_success(self) -> None:
        """list_files returns list of FileObjects."""
        now = datetime.now().isoformat()
        file_data = [
            {
                "id": "12345678-1234-5678-1234-567812345678",
                "type": "document",
                "filename": "doc1.pdf",
                "mimeType": "application/pdf",
                "bucketPath": "projects/123/documents/doc1.pdf",
                "createdAt": now,
                "updatedAt": now,
            },
            {
                "id": "22345678-1234-5678-1234-567812345678",
                "type": "document",
                "filename": "doc2.pdf",
                "mimeType": "application/pdf",
                "bucketPath": "projects/123/documents/doc2.pdf",
                "createdAt": now,
                "updatedAt": now,
            },
        ]

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = file_data
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("src.utils.dms_utils._get_client", return_value=mock_client):
            result = await list_files(
                ListFilesInput(
                    project_id=UUID("98765432-1234-5678-1234-567812345678"),
                    file_type="document",
                    page=1,
                    page_size=100,
                )
            )

        assert len(result) == 2
        assert result[0].filename == "doc1.pdf"
        assert result[1].filename == "doc2.pdf"

    @pytest.mark.asyncio
    async def test_list_files_empty(self) -> None:
        """list_files returns empty list when no files found."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        empty_list: list[dict[str, Any]] = []
        mock_response.json.return_value = empty_list
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("src.utils.dms_utils._get_client", return_value=mock_client):
            result = await list_files(
                ListFilesInput(
                    project_id=UUID("98765432-1234-5678-1234-567812345678"),
                )
            )

        assert result == []

    @pytest.mark.asyncio
    async def test_list_files_http_error(self) -> None:
        """list_files raises on HTTP errors."""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Server Error", request=MagicMock(), response=mock_response
        )

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch("src.utils.dms_utils._get_client", return_value=mock_client):
            with pytest.raises(httpx.HTTPStatusError):
                await list_files(
                    ListFilesInput(
                        project_id=UUID("98765432-1234-5678-1234-567812345678"),
                    )
                )


# ============================================================================
# 3. api_client.py - DoclingApiClient coverage
# ============================================================================

from src.providers.docling.api_client import DoclingApiClient  # noqa: E402


class TestDoclingApiClient:
    """Tests for DoclingApiClient covering lines 21-22, 42-70."""

    def test_init(self) -> None:
        """Test __init__ stores base_url and timeout."""
        client = DoclingApiClient(base_url="http://localhost:5001/", timeout=600)
        assert client.base_url == "http://localhost:5001/"
        assert client.timeout == 600

    def test_init_strips_trailing_slash(self) -> None:
        """Test that base_url is stored as-is (no stripping in this implementation)."""
        client = DoclingApiClient(base_url="http://localhost:5001", timeout=300)
        assert client.base_url == "http://localhost:5001"
        assert client.timeout == 300

    @staticmethod
    def _mock_async_client(**overrides: Any) -> AsyncMock:
        """Create a mock httpx.AsyncClient with async context manager support."""
        client = AsyncMock()
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=False)
        for attr, value in overrides.items():
            setattr(client, attr, value)
        return client

    @staticmethod
    def _json_response(data: Any, status_code: int = 200) -> httpx.Response:
        """Build an httpx.Response with JSON data for testing."""
        return httpx.Response(status_code, json=data, request=httpx.Request("GET", "http://test"))

    @pytest.mark.asyncio
    async def test_convert_document_success(self) -> None:
        """Test successful document conversion via async submit/poll/fetch."""
        expected_result = {
            "status": "success",
            "document": {"md_content": "# Title\nContent"},
        }

        mock_client = self._mock_async_client(
            post=AsyncMock(return_value=self._json_response({"task_id": "t-1"})),
            get=AsyncMock(
                side_effect=[
                    self._json_response({"task_id": "t-1", "task_status": "success"}),
                    self._json_response(expected_result),
                ]
            ),
        )

        with (
            patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client),
            patch("src.providers.docling.api_client.get_keycloak_token_provider", return_value=None),
            patch("src.providers.docling.api_client.asyncio.sleep", new_callable=AsyncMock),
        ):
            client = DoclingApiClient(base_url="http://localhost:5001", timeout=300)
            result = await client.convert_document(b"fake-pdf-bytes", "test.pdf")

        assert result == expected_result
        assert "/v1/convert/file/async" in mock_client.post.call_args[0][0]

    @pytest.mark.asyncio
    async def test_convert_document_failure_status(self) -> None:
        """Test that RuntimeError is raised when result status is 'failure'."""
        error_result = {
            "status": "failure",
            "errors": ["PDF parsing failed"],
        }

        mock_client = self._mock_async_client(
            post=AsyncMock(return_value=self._json_response({"task_id": "t-1"})),
            get=AsyncMock(
                side_effect=[
                    self._json_response({"task_id": "t-1", "task_status": "success"}),
                    self._json_response(error_result),
                ]
            ),
        )

        with (
            patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client),
            patch("src.providers.docling.api_client.get_keycloak_token_provider", return_value=None),
            patch("src.providers.docling.api_client.asyncio.sleep", new_callable=AsyncMock),
        ):
            client = DoclingApiClient(base_url="http://localhost:5001", timeout=300)
            with pytest.raises(RuntimeError, match="conversion failed"):
                await client.convert_document(b"fake-pdf", "bad.pdf")

    @pytest.mark.asyncio
    async def test_convert_document_skipped_status(self) -> None:
        """Test that RuntimeError is raised when result status is 'skipped'."""
        skipped_result = {"status": "skipped"}

        mock_client = self._mock_async_client(
            post=AsyncMock(return_value=self._json_response({"task_id": "t-1"})),
            get=AsyncMock(
                side_effect=[
                    self._json_response({"task_id": "t-1", "task_status": "success"}),
                    self._json_response(skipped_result),
                ]
            ),
        )

        with (
            patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client),
            patch("src.providers.docling.api_client.get_keycloak_token_provider", return_value=None),
            patch("src.providers.docling.api_client.asyncio.sleep", new_callable=AsyncMock),
        ):
            client = DoclingApiClient(base_url="http://localhost:5001", timeout=300)
            with pytest.raises(RuntimeError, match="skipped"):
                await client.convert_document(b"fake-pdf", "skip.pdf")

    @pytest.mark.asyncio
    async def test_convert_document_http_error(self) -> None:
        """Test that HTTP 500 on submit is wrapped in RuntimeError."""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Server Error", request=MagicMock(), response=mock_response
        )

        mock_client = self._mock_async_client(
            post=AsyncMock(return_value=mock_response),
        )

        with (
            patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client),
            patch("src.providers.docling.api_client.get_keycloak_token_provider", return_value=None),
            patch("src.providers.docling.api_client.asyncio.sleep", new_callable=AsyncMock),
        ):
            client = DoclingApiClient(base_url="http://localhost:5001", timeout=300)
            with pytest.raises(RuntimeError, match="submit failed"):
                await client.convert_document(b"fake-pdf", "error.pdf")

    @pytest.mark.asyncio
    async def test_convert_document_sends_correct_data(self) -> None:
        """Test that convert_document sends correct form data."""
        mock_client = self._mock_async_client(
            post=AsyncMock(return_value=self._json_response({"task_id": "t-1"})),
            get=AsyncMock(
                side_effect=[
                    self._json_response({"task_id": "t-1", "task_status": "success"}),
                    self._json_response({"status": "success", "document": {}}),
                ]
            ),
        )

        with (
            patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client),
            patch("src.providers.docling.api_client.get_keycloak_token_provider", return_value=None),
            patch("src.providers.docling.api_client.asyncio.sleep", new_callable=AsyncMock),
        ):
            client = DoclingApiClient(base_url="http://docling:5001", timeout=120)
            await client.convert_document(b"\x25PDF-1.4", "document.pdf")

        call_kwargs = mock_client.post.call_args
        assert call_kwargs[1]["data"]["do_ocr"] == "true"
        assert call_kwargs[1]["data"]["table_mode"] == "accurate"
        assert call_kwargs[1]["data"]["document_timeout"] == "120"
