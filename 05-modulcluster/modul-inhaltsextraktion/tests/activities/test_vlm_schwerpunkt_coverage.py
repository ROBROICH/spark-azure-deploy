# tests/activities/test_vlm_schwerpunkt_coverage.py
"""
Comprehensive tests for pure functions in:
- src/activities/vlm_invoke.py (cache, compression, VLMInvokeInput)
- src/activities/schwerpunkt_extraction.py (cleaning, context building, topic resolution)
- src/activities/species_scale_extraction.py (empty result, cleaning, dataclass)
- src/activities/hypothetical_questions.py (cleaning, dataclass)
"""

import io
import uuid
from typing import Any
from unittest.mock import MagicMock, patch

from PIL import Image

from src.activities.hypothetical_questions import (
    ProcessHypotheticalQuestionsBatchInput,
    _clean_content_for_hypothetical_questions,
)
from src.activities.schwerpunkt_extraction import (
    ProcessSchwerpunktBatchInput,
    _clean_content_for_schwerpunktthema,
    _resolve_topic_name,
)
from src.activities.species_scale_extraction import (
    ProcessSpeciesScaleBatchInput,
    _clean_content_for_species_scale,
)
from src.activities.vlm_invoke import (
    _IMAGE_CACHE_MAX_SIZE,
    VLM_IMAGE_MAX_BYTES,
    PrepareVlmImageInput,
    _compress_image_for_vlm,
    _image_cache,
    _image_cache_get,
    _image_cache_put,
)
from src.schemas import Chunk

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_small_png(width: int = 100, height: int = 100, color: str = "red") -> bytes:
    """Create a small in-memory PNG image using Pillow."""
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_rgba_png(width: int = 100, height: int = 100) -> bytes:
    """Create a small RGBA PNG image."""
    img = Image.new("RGBA", (width, height), (255, 0, 0, 128))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_palette_png(width: int = 50, height: int = 50) -> bytes:
    """Create a palette-mode (P) PNG image."""
    img = Image.new("P", (width, height))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_grayscale_png(width: int = 50, height: int = 50) -> bytes:
    """Create a grayscale (L) PNG image."""
    img = Image.new("L", (width, height), 128)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_chunk(page_content: str = "test content", metadata: dict[str, Any] | None = None) -> Chunk:
    """Create a Chunk with sensible defaults."""
    return Chunk(
        chunk_id=uuid.uuid4(),
        page_content=page_content,
        metadata=metadata or {},
    )


# ===========================================================================
# 1. vlm_invoke.py -- Image Cache
# ===========================================================================


class TestImageCache:
    """Tests for the LRU image cache (_image_cache_get / _image_cache_put)."""

    def setup_method(self) -> None:
        """Clear the image cache before each test."""
        _image_cache.clear()

    def test_get_returns_none_on_miss(self) -> None:
        """Test that cache get returns None for a missing key."""
        assert _image_cache_get("nonexistent") is None

    def test_put_and_get_round_trip(self) -> None:
        """Test that a put followed by get returns the same value."""
        value = b"compressed", "image/jpeg"
        _image_cache_put("key1", value)
        assert _image_cache_get("key1") == value

    def test_get_moves_to_end(self) -> None:
        """Test that accessing a key moves it to the end of the LRU order."""
        _image_cache_put("a", (b"a", "image/jpeg"))
        _image_cache_put("b", (b"b", "image/jpeg"))
        # Access "a" to move it to end
        _image_cache_get("a")
        keys = list(_image_cache.keys())
        assert keys[-1] == "a"

    def test_put_existing_key_moves_to_end(self) -> None:
        """Test that re-putting an existing key moves it to the end and updates its value."""
        _image_cache_put("a", (b"a1", "image/jpeg"))
        _image_cache_put("b", (b"b1", "image/jpeg"))
        # Re-put "a" with new value
        _image_cache_put("a", (b"a2", "image/png"))
        keys = list(_image_cache.keys())
        assert keys[-1] == "a"
        assert _image_cache_get("a") == (b"a2", "image/png")

    def test_eviction_at_capacity(self) -> None:
        """When cache reaches _IMAGE_CACHE_MAX_SIZE, the oldest entry is evicted."""
        for i in range(_IMAGE_CACHE_MAX_SIZE):
            _image_cache_put(f"key_{i}", (b"data", "image/jpeg"))

        assert len(_image_cache) == _IMAGE_CACHE_MAX_SIZE
        # The first key should still be present
        assert _image_cache_get("key_0") is not None

        # Add one more -- "key_0" was just accessed so it is now at the end;
        # the oldest is "key_1"
        _image_cache_put("overflow", (b"overflow", "image/jpeg"))
        assert len(_image_cache) == _IMAGE_CACHE_MAX_SIZE
        assert _image_cache_get("key_1") is None  # evicted
        assert _image_cache_get("overflow") is not None

    def test_eviction_removes_oldest_not_recently_used(self) -> None:
        """Access patterns should protect recently-used entries from eviction."""
        for i in range(_IMAGE_CACHE_MAX_SIZE):
            _image_cache_put(str(i), (bytes([i % 256]), "image/jpeg"))

        # Access entry "0" to make it most-recently-used
        _image_cache_get("0")
        # Insert a new entry -- entry "1" (the new oldest) should be evicted
        _image_cache_put("new", (b"new", "image/jpeg"))
        assert _image_cache_get("1") is None
        assert _image_cache_get("0") is not None

    def test_max_size_constant(self) -> None:
        """Test that the image cache max size constant is 200."""
        assert _IMAGE_CACHE_MAX_SIZE == 200


# ===========================================================================
# 2. vlm_invoke.py -- Image Compression
# ===========================================================================


class TestCompressImageForVlm:
    """Tests for _compress_image_for_vlm."""

    def setup_method(self) -> None:
        """Clear the image cache before each test."""
        _image_cache.clear()

    @patch("src.activities.vlm_invoke.activity")
    def test_small_rgb_png_compresses_to_jpeg(self, mock_activity: Any) -> None:
        """Test that a small RGB PNG is compressed to a valid JPEG."""
        mock_activity.logger = MagicMock()
        image_bytes = _make_small_png(100, 100)
        compressed, mime = _compress_image_for_vlm(image_bytes, "test.png")

        assert mime == "image/jpeg"
        assert len(compressed) > 0
        assert len(compressed) <= VLM_IMAGE_MAX_BYTES
        # Verify it is valid JPEG
        img = Image.open(io.BytesIO(compressed))
        assert img.format == "JPEG"

    @patch("src.activities.vlm_invoke.activity")
    def test_rgba_png_converts_to_rgb_jpeg(self, mock_activity: Any) -> None:
        """Test that an RGBA PNG is converted to RGB mode and compressed to JPEG."""
        mock_activity.logger = MagicMock()
        image_bytes = _make_rgba_png(80, 80)
        compressed, mime = _compress_image_for_vlm(image_bytes, "rgba.png")

        assert mime == "image/jpeg"
        img = Image.open(io.BytesIO(compressed))
        assert img.mode == "RGB"

    @patch("src.activities.vlm_invoke.activity")
    def test_palette_png_converts_to_rgb_jpeg(self, mock_activity: Any) -> None:
        """Test that a palette-mode PNG is converted to RGB and compressed to JPEG."""
        mock_activity.logger = MagicMock()
        image_bytes = _make_palette_png()
        compressed, mime = _compress_image_for_vlm(image_bytes, "palette.png")

        assert mime == "image/jpeg"
        img = Image.open(io.BytesIO(compressed))
        assert img.mode == "RGB"

    @patch("src.activities.vlm_invoke.activity")
    def test_grayscale_png_converts_to_rgb_jpeg(self, mock_activity: Any) -> None:
        """Test that a grayscale PNG is converted to RGB and compressed to JPEG."""
        mock_activity.logger = MagicMock()
        image_bytes = _make_grayscale_png()
        compressed, mime = _compress_image_for_vlm(image_bytes, "gray.png")

        assert mime == "image/jpeg"
        img = Image.open(io.BytesIO(compressed))
        assert img.mode == "RGB"

    @patch("src.activities.vlm_invoke.activity")
    def test_large_image_gets_resized(self, mock_activity: Any) -> None:
        """A very large image should be resized down to fit the size limit."""
        mock_activity.logger = MagicMock()
        # Create a large image (3000x3000) that will exceed VLM_IMAGE_MAX_BYTES
        large_bytes = _make_small_png(3000, 3000)
        compressed, mime = _compress_image_for_vlm(large_bytes, "large.png")

        assert mime == "image/jpeg"
        assert len(compressed) <= VLM_IMAGE_MAX_BYTES

    @patch("src.activities.vlm_invoke.activity")
    def test_invalid_bytes_returns_original(self, mock_activity: Any) -> None:
        """Invalid image bytes should fall back to returning original bytes."""
        mock_activity.logger = MagicMock()
        garbage = b"not-an-image"
        result_bytes, result_mime = _compress_image_for_vlm(garbage, "broken.jpg")

        assert result_bytes == garbage
        assert result_mime == "image/jpeg"  # guessed from .jpg extension
        mock_activity.logger.warning.assert_called_once()

    @patch("src.activities.vlm_invoke.activity")
    def test_invalid_bytes_unknown_ext_falls_back_to_jpeg(self, mock_activity: Any) -> None:
        """Invalid bytes with truly unknown extension should default to image/jpeg."""
        mock_activity.logger = MagicMock()
        garbage = b"not-an-image"
        # Use extension that mimetypes.guess_type returns None for
        result_bytes, result_mime = _compress_image_for_vlm(garbage, "broken.qzx123")

        assert result_bytes == garbage
        assert result_mime == "image/jpeg"

    @patch("src.activities.vlm_invoke.activity")
    def test_compression_logs_info(self, mock_activity: Any) -> None:
        """Successful compression should log an info message."""
        mock_activity.logger = MagicMock()
        image_bytes = _make_small_png(100, 100)
        _compress_image_for_vlm(image_bytes, "test.png")
        mock_activity.logger.info.assert_called()


# ===========================================================================
# 4. vlm_invoke.py -- VLMInvokeInput Model
# ===========================================================================


class TestPrepareVlmImageInput:
    """Tests for the PrepareVlmImageInput Pydantic model."""

    def test_create_with_required_fields(self) -> None:
        """Test that PrepareVlmImageInput can be created with required fields and has correct defaults."""
        inp = PrepareVlmImageInput(
            image_data=b"raw-image-bytes",
            image_ref="img_001.png",
        )
        assert inp.image_ref == "img_001.png"
        assert inp.element_type == "image"  # default

    def test_create_with_element_type_table(self) -> None:
        """Test that PrepareVlmImageInput accepts a custom element_type."""
        inp = PrepareVlmImageInput(
            image_data=b"table-image",
            image_ref="table_001.png",
            element_type="table",
        )
        assert inp.element_type == "table"

    def test_image_data_bytes(self) -> None:
        """Test that image_data bytes are stored and retrieved correctly."""
        raw = b"\x89PNG\r\n\x1a\n"
        inp = PrepareVlmImageInput(
            image_data=raw,
            image_ref="test.png",
        )
        assert bytes(inp.image_data) == raw


# ===========================================================================
# 5. schwerpunkt_extraction.py -- _clean_content_for_schwerpunktthema
# ===========================================================================


class TestCleanContentForSchwerpunktthema:
    """Tests for _clean_content_for_schwerpunktthema."""

    def test_replaces_bild_with_summary(self) -> None:
        """Test that BILD tags are replaced with their summary text."""
        content = '<BILD id="img1"><summary>A bird</summary><description>Long description</description></BILD>'
        result = _clean_content_for_schwerpunktthema(content)
        assert result == "A bird"

    def test_replaces_bild_without_summary_returns_empty(self) -> None:
        """Test that BILD tags without a summary are replaced with an empty string."""
        content = '<BILD id="img1"><description>Some description</description></BILD>'
        result = _clean_content_for_schwerpunktthema(content)
        assert result == ""

    def test_replaces_tabelle_with_summary(self) -> None:
        """Test that TABELLE tags are replaced with their summary text."""
        content = '<TABELLE id="t1"><summary>Revenue table</summary><raw_table><table><tr><td>100</td></tr></table></raw_table></TABELLE>'
        result = _clean_content_for_schwerpunktthema(content)
        assert result == "Revenue table"

    def test_replaces_tabelle_falls_back_to_table_text(self) -> None:
        """When TABELLE has no summary, extract_table_text should be used."""
        content = '<TABELLE id="t1"><raw_table><table><tr><td>Cell value</td></tr></table></raw_table></TABELLE>'
        result = _clean_content_for_schwerpunktthema(content)
        assert "Cell value" in result

    def test_mixed_content_preserves_text(self) -> None:
        """Test that plain text surrounding BILD and TABELLE tags is preserved."""
        content = 'Before <BILD id="1"><summary>Pic</summary></BILD> after <TABELLE id="2"><summary>Tab</summary></TABELLE> end'
        result = _clean_content_for_schwerpunktthema(content)
        assert "Before" in result
        assert "Pic" in result
        assert "after" in result
        assert "Tab" in result
        assert "end" in result

    def test_no_tags_returns_content_unchanged(self) -> None:
        """Test that content without BILD or TABELLE tags is returned unchanged."""
        content = "Just plain text with no tags."
        result = _clean_content_for_schwerpunktthema(content)
        assert result == content

    def test_empty_string(self) -> None:
        """Test that an empty string input returns an empty string."""
        assert _clean_content_for_schwerpunktthema("") == ""

    def test_bild_with_attributes(self) -> None:
        """Test that BILD tags with extra attributes are cleaned correctly."""
        content = '<BILD type="photo" page="3"><summary>Landscape</summary></BILD>'
        result = _clean_content_for_schwerpunktthema(content)
        assert result == "Landscape"


# ===========================================================================
# 7. schwerpunkt_extraction.py -- _resolve_topic_name
# ===========================================================================


class TestResolveTopicName:
    """Tests for _resolve_topic_name."""

    def test_returns_unsicher_for_minus_one(self) -> None:
        """Test that topic ID -1 resolves to 'Unsicher'."""
        assert _resolve_topic_name(-1) == "Unsicher"

    def test_returns_name_for_valid_id(self) -> None:
        """Test that a valid topic ID resolves to the correct topic name."""
        # ID 1 is "Abfallwirtschaft / Kreislaufwirtschaft" in TOPICS
        result = _resolve_topic_name(1)
        assert result == "Abfallwirtschaft / Kreislaufwirtschaft"

    def test_invalid_id_returns_invalid(self) -> None:
        """Test that an out-of-range topic ID returns 'Invalid ID'."""
        result = _resolve_topic_name(999)
        assert result == "Invalid ID"

    def test_invalid_id_zero(self) -> None:
        """Test that topic ID 0 is treated as invalid."""
        result = _resolve_topic_name(0)
        assert result == "Invalid ID"


# ===========================================================================
# 8. schwerpunkt_extraction.py -- ProcessSchwerpunktBatchInput
# ===========================================================================


class TestProcessSchwerpunktBatchInput:
    """Tests for the ProcessSchwerpunktBatchInput dataclass."""

    def test_instantiation(self) -> None:
        """Test that ProcessSchwerpunktBatchInput can be instantiated with chunks."""
        chunks = [_make_chunk("chunk 1"), _make_chunk("chunk 2")]
        inp = ProcessSchwerpunktBatchInput(chunks=chunks)
        assert len(inp.chunks) == 2
        assert inp.chunks[0].page_content == "chunk 1"

    def test_empty_chunks(self) -> None:
        """Test that ProcessSchwerpunktBatchInput accepts an empty chunk list."""
        inp = ProcessSchwerpunktBatchInput(chunks=[])
        assert inp.chunks == []


# ===========================================================================
# 10. species_scale_extraction.py -- _clean_content_for_species_scale
# ===========================================================================


class TestCleanContentForSpeciesScale:
    """Tests for _clean_content_for_species_scale."""

    def test_replaces_bild_with_summary(self) -> None:
        """Test that BILD tags are replaced with their summary text."""
        content = '<BILD id="1"><summary>A forest</summary></BILD>'
        result = _clean_content_for_species_scale(content)
        assert result == "A forest"

    def test_replaces_bild_without_summary_returns_empty(self) -> None:
        """Test that BILD tags without a summary are replaced with an empty string."""
        content = '<BILD id="1"><description>Desc</description></BILD>'
        result = _clean_content_for_species_scale(content)
        assert result == ""

    def test_replaces_tabelle_with_summary(self) -> None:
        """Test that TABELLE tags are replaced with their summary text."""
        content = '<TABELLE id="1"><summary>Species list</summary></TABELLE>'
        result = _clean_content_for_species_scale(content)
        assert result == "Species list"

    def test_replaces_tabelle_falls_back_to_table_text(self) -> None:
        """Test that TABELLE without summary falls back to extracted table text."""
        content = '<TABELLE id="1"><raw_table><table><tr><td>Feldhase</td></tr></table></raw_table></TABELLE>'
        result = _clean_content_for_species_scale(content)
        assert "Feldhase" in result

    def test_tabelle_with_empty_summary_uses_table_text(self) -> None:
        """Test that TABELLE with a whitespace-only summary falls back to table text."""
        content = '<TABELLE id="1"><summary>  </summary><raw_table><table><tr><td>Rotmilan</td></tr></table></raw_table></TABELLE>'
        result = _clean_content_for_species_scale(content)
        assert "Rotmilan" in result

    def test_plain_text_unchanged(self) -> None:
        """Test that plain text without tags is returned unchanged."""
        content = "No special tags here."
        assert _clean_content_for_species_scale(content) == content

    def test_empty_string(self) -> None:
        """Test that an empty string input returns an empty string."""
        assert _clean_content_for_species_scale("") == ""

    def test_mixed_content(self) -> None:
        """Test that mixed plain text and BILD tags are cleaned correctly."""
        content = 'Text before <BILD id="1"><summary>Image summary</summary></BILD> text after'
        result = _clean_content_for_species_scale(content)
        assert "Text before" in result
        assert "Image summary" in result
        assert "text after" in result


# ===========================================================================
# 11. species_scale_extraction.py -- ProcessSpeciesScaleBatchInput
# ===========================================================================


class TestProcessSpeciesScaleBatchInput:
    """Tests for the ProcessSpeciesScaleBatchInput dataclass."""

    def test_instantiation(self) -> None:
        """Test that ProcessSpeciesScaleBatchInput can be instantiated with chunks."""
        chunks = [_make_chunk("Species text")]
        inp = ProcessSpeciesScaleBatchInput(chunks=chunks)
        assert len(inp.chunks) == 1

    def test_empty_chunks(self) -> None:
        """Test that ProcessSpeciesScaleBatchInput accepts an empty chunk list."""
        inp = ProcessSpeciesScaleBatchInput(chunks=[])
        assert inp.chunks == []


# ===========================================================================
# 12. hypothetical_questions.py -- _clean_content_for_hypothetical_questions
# ===========================================================================


class TestCleanContentForHypotheticalQuestions:
    """Tests for _clean_content_for_hypothetical_questions."""

    def test_bild_with_summary(self) -> None:
        """Test that BILD with summary produces '[Bild: summary]'."""
        content = '<BILD id="1"><summary>Sunrise view</summary></BILD>'
        result = _clean_content_for_hypothetical_questions(content)
        assert result == "[Bild: Sunrise view]"

    def test_bild_with_description_no_summary(self) -> None:
        """Test that BILD without summary falls back to description."""
        content = '<BILD id="1"><description>A mountain landscape</description></BILD>'
        result = _clean_content_for_hypothetical_questions(content)
        assert result == "[Bild: A mountain landscape]"

    def test_bild_with_caption_no_summary_no_description(self) -> None:
        """Test that BILD without summary or description falls back to caption."""
        content = '<BILD id="1"><caption_text>Figure 1: Map</caption_text></BILD>'
        result = _clean_content_for_hypothetical_questions(content)
        assert result == "[Bild: Figure 1: Map]"

    def test_bild_fallback_no_metadata(self) -> None:
        """Test that BILD with no usable metadata produces a bare '[Bild]' placeholder."""
        content = '<BILD id="1"><raw_image>base64data</raw_image></BILD>'
        result = _clean_content_for_hypothetical_questions(content)
        assert result == "[Bild]"

    def test_bild_summary_takes_priority_over_description(self) -> None:
        """Test that summary is preferred over description when both are present."""
        content = '<BILD id="1"><summary>Summary text</summary><description>Desc text</description></BILD>'
        result = _clean_content_for_hypothetical_questions(content)
        assert result == "[Bild: Summary text]"

    def test_bild_empty_summary_falls_back_to_description(self) -> None:
        """Test that a whitespace-only summary causes fallback to description."""
        content = '<BILD id="1"><summary>  </summary><description>Desc text</description></BILD>'
        result = _clean_content_for_hypothetical_questions(content)
        assert result == "[Bild: Desc text]"

    def test_tabelle_with_summary(self) -> None:
        """Test that TABELLE with summary produces '[Tabelle: summary]'."""
        content = '<TABELLE id="1"><summary>Revenue overview</summary></TABELLE>'
        result = _clean_content_for_hypothetical_questions(content)
        assert result == "[Tabelle: Revenue overview]"

    def test_tabelle_with_caption_and_table_content(self) -> None:
        """Test that TABELLE with caption and raw table includes both in output."""
        content = (
            '<TABELLE id="1">'
            "<caption_text>Table 1</caption_text>"
            "<raw_table><table><tr><td>Data</td></tr></table></raw_table>"
            "</TABELLE>"
        )
        result = _clean_content_for_hypothetical_questions(content)
        assert "[Tabelle 'Table 1':" in result
        assert "Data" in result

    def test_tabelle_with_caption_no_raw_table(self) -> None:
        """Caption present but no <table> tag -- extract_table_text still finds
        text from the inner HTML (caption_text tag is stripped), so the
        'caption + table_text' branch is taken."""
        content = '<TABELLE id="1"><caption_text>Table 1</caption_text></TABELLE>'
        result = _clean_content_for_hypothetical_questions(content)
        # extract_table_text strips all tags from inner content, yielding "Table 1"
        # so the result is "[Tabelle 'Table 1': Table 1]"
        assert "Table 1" in result
        assert "[Tabelle" in result

    def test_tabelle_fallback_to_raw_html(self) -> None:
        """Test that TABELLE without summary falls back to extracted table text."""
        content = (
            '<TABELLE id="1"><raw_table><table><tr><td>Cell A</td><td>Cell B</td></tr></table></raw_table></TABELLE>'
        )
        result = _clean_content_for_hypothetical_questions(content)
        assert "[Tabelle:" in result
        assert "Cell A" in result

    def test_tabelle_fallback_no_content(self) -> None:
        """Test that an empty TABELLE tag produces a bare '[Tabelle]' placeholder."""
        content = '<TABELLE id="1"></TABELLE>'
        result = _clean_content_for_hypothetical_questions(content)
        assert result == "[Tabelle]"

    def test_plain_text_unchanged(self) -> None:
        """Test that plain text without tags is returned unchanged."""
        content = "Regular text without any tags."
        assert _clean_content_for_hypothetical_questions(content) == content

    def test_empty_string(self) -> None:
        """Test that an empty string input returns an empty string."""
        assert _clean_content_for_hypothetical_questions("") == ""

    def test_multiple_elements_in_sequence(self) -> None:
        """Test that multiple BILD and TABELLE elements in sequence are all cleaned."""
        content = (
            '<BILD id="1"><summary>Photo</summary></BILD> '
            "middle text "
            '<TABELLE id="2"><summary>Data table</summary></TABELLE>'
        )
        result = _clean_content_for_hypothetical_questions(content)
        assert "[Bild: Photo]" in result
        assert "middle text" in result
        assert "[Tabelle: Data table]" in result

    def test_bild_with_attributes(self) -> None:
        """Test that BILD with extra attributes is cleaned correctly."""
        content = '<BILD type="photo" page="5"><summary>Attr test</summary></BILD>'
        result = _clean_content_for_hypothetical_questions(content)
        assert result == "[Bild: Attr test]"

    def test_tabelle_with_attributes(self) -> None:
        """Test that TABELLE with extra attributes is cleaned correctly."""
        content = '<TABELLE type="data" page="2"><summary>Attr table</summary></TABELLE>'
        result = _clean_content_for_hypothetical_questions(content)
        assert result == "[Tabelle: Attr table]"


# ===========================================================================
# 13. hypothetical_questions.py -- ProcessHypotheticalQuestionsBatchInput
# ===========================================================================


class TestProcessHypotheticalQuestionsBatchInput:
    """Tests for the ProcessHypotheticalQuestionsBatchInput dataclass."""

    def test_instantiation(self) -> None:
        """Test that ProcessHypotheticalQuestionsBatchInput can be instantiated with chunks."""
        chunks = [_make_chunk("Chunk for questions")]
        inp = ProcessHypotheticalQuestionsBatchInput(chunks=chunks)
        assert len(inp.chunks) == 1

    def test_empty_chunks(self) -> None:
        """Test that ProcessHypotheticalQuestionsBatchInput accepts an empty chunk list."""
        inp = ProcessHypotheticalQuestionsBatchInput(chunks=[])
        assert inp.chunks == []

    def test_multiple_chunks(self) -> None:
        """Test that ProcessHypotheticalQuestionsBatchInput handles multiple chunks."""
        chunks = [_make_chunk(f"Chunk {i}") for i in range(5)]
        inp = ProcessHypotheticalQuestionsBatchInput(chunks=chunks)
        assert len(inp.chunks) == 5


# ===========================================================================
# 14. Additional edge case tests
# ===========================================================================


class TestImageCacheEdgeCases:
    """Additional edge case tests for cache behavior."""

    def setup_method(self) -> None:
        """Clear the image cache before each test."""
        _image_cache.clear()

    def test_put_same_key_multiple_times(self) -> None:
        """Putting the same key multiple times should update the value."""
        _image_cache_put("key", (b"v1", "image/jpeg"))
        _image_cache_put("key", (b"v2", "image/jpeg"))
        _image_cache_put("key", (b"v3", "image/jpeg"))
        assert _image_cache_get("key") == (b"v3", "image/jpeg")
        assert len(_image_cache) == 1

    def test_cache_ordering_preserved(self) -> None:
        """Keys should be ordered by access time (LRU order)."""
        _image_cache_put("a", (b"a", "image/jpeg"))
        _image_cache_put("b", (b"b", "image/jpeg"))
        _image_cache_put("c", (b"c", "image/jpeg"))
        # Access 'a' to make it most recent
        _image_cache_get("a")
        keys = list(_image_cache.keys())
        assert keys == ["b", "c", "a"]

    def test_put_to_full_cache_replaces_oldest(self) -> None:
        """Filling cache to max and adding one more should remove the oldest."""
        for i in range(_IMAGE_CACHE_MAX_SIZE):
            _image_cache_put(f"k{i}", (f"v{i}".encode(), "image/jpeg"))
        assert len(_image_cache) == _IMAGE_CACHE_MAX_SIZE
        # k0 is the oldest
        _image_cache_put("new_key", (b"new", "image/jpeg"))
        assert _image_cache_get("k0") is None
        assert _image_cache_get("new_key") == (b"new", "image/jpeg")
        assert len(_image_cache) == _IMAGE_CACHE_MAX_SIZE


class TestCleanContentCrossModule:
    """Cross-module tests to verify consistent cleaning behavior."""

    def test_schwerpunkt_and_species_scale_same_bild_behavior(self) -> None:
        """Both modules should handle BILD tags the same way (extract summary)."""
        content = '<BILD id="x"><summary>Same summary</summary></BILD>'
        schwerpunkt_result = _clean_content_for_schwerpunktthema(content)
        species_result = _clean_content_for_species_scale(content)
        assert schwerpunkt_result == "Same summary"
        assert species_result == "Same summary"

    def test_hypo_questions_wraps_in_brackets_unlike_others(self) -> None:
        """Hypothetical questions wraps output in [Bild: ...], others do not."""
        content = '<BILD id="x"><summary>A photo</summary></BILD>'
        hypo_result = _clean_content_for_hypothetical_questions(content)
        schwerpunkt_result = _clean_content_for_schwerpunktthema(content)

        assert hypo_result == "[Bild: A photo]"
        assert schwerpunkt_result == "A photo"

    def test_multiline_content_in_tags(self) -> None:
        """Tags with multiline content should be handled correctly."""
        content = '<BILD id="1"><summary>\n  Line 1\n  Line 2\n</summary></BILD>'
        schwerpunkt = _clean_content_for_schwerpunktthema(content)
        assert "Line 1" in schwerpunkt
        assert "Line 2" in schwerpunkt


class TestResolveTopicNameEdgeCases:
    """Edge cases for _resolve_topic_name."""

    def test_returns_full_name(self) -> None:
        """Returns the full topic name from TOPICS."""
        # ID 2 is "Abschnittsbildung" in TOPICS
        assert _resolve_topic_name(2) == "Abschnittsbildung"

    def test_negative_id_not_minus_one(self) -> None:
        """Negative IDs other than -1 should be invalid."""
        result = _resolve_topic_name(-2)
        assert result == "Invalid ID"
