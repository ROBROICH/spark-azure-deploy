"""Tests for the HeaderFooterFilter processor."""
from collections.abc import Generator
from typing import Any
from unittest.mock import MagicMock, patch

import imagehash
import pytest

from src.processors.header_footer_filter import HeaderFooterFilter
from src.providers.base import ContentItemDict


# Mock imagehash.phash to return a consistent hash for testing
@pytest.fixture
def mock_imagehash_phash() -> Generator[MagicMock]:
    """Mock for Imagehash"""
    with patch("imagehash.phash") as mock_phash:
        # Create a mock hash object that can be compared
        mock_hash_obj = imagehash.hex_to_hash("f" * 16)
        mock_phash.return_value = mock_hash_obj
        yield mock_phash


# Mock PIL.Image.open to avoid actual file operations
@pytest.fixture
def mock_image_open() -> Generator[MagicMock]:
    """Mock for open image"""
    with patch("PIL.Image.open") as mock_open:
        yield mock_open


@pytest.mark.parametrize(
    "bbox, expected",
    [
        ([0, 0, 100, 100], True),  # In header
        ([0, 900, 100, 1000], True),  # In footer
        ([0, 200, 100, 300], False),  # Neither
    ],
)
def test_is_in_header_or_footer(bbox: Any, expected: Any) -> None:
    """Test if header or footer."""
    header_zone_end = 1000 * 0.15
    footer_zone_start = 1000 * (1 - 0.15)
    assert HeaderFooterFilter._is_in_header_or_footer(bbox, header_zone_end, footer_zone_start) == expected


@pytest.mark.parametrize(
    "text, expected",
    [
        ("Page 1", "Page "),
        ("Hello World", "Hello World"),
        ("Item 1.2.3", "Item .."),
        ("12345", ""),
    ],
)
def test_get_normalized_text(text: Any, expected: Any) -> None:
    """Test get normalized text."""
    assert HeaderFooterFilter._get_normalized_text(text) == expected


def test_filter_recurring_elements_no_potential_elements() -> None:
    """Test that non-header/footer content is not filtered out."""
    content_list: list[ContentItemDict] = [
        {
            "type": "text",
            "text": "Normal content",
            "bbox": [0, 200, 100, 300],
            "page_idx": 0,
        }
    ]
    images: dict[str, bytes] = {}

    filtered_list, filtered_images, filtered_tables, filtered_text = HeaderFooterFilter.filter_recurring_elements(
        content_list, images, page_height=1000
    )
    assert filtered_list == content_list
    assert not filtered_images
    assert not filtered_tables


def test_filter_recurring_elements_recurring_images(mock_image_open: Any, mock_imagehash_phash: Any) -> None:
    """Test that recurring header-zone images are filtered and duplicates are tracked."""
    content_list: list[ContentItemDict] = [
        {
            "type": "image",
            "img_path": "image1.png",
            "bbox": [0, 0, 100, 50],
            "page_idx": 0,
        },
        {
            "type": "image",
            "img_path": "image2.png",
            "bbox": [0, 0, 100, 50],
            "page_idx": 1,
        },
        {
            "type": "image",
            "img_path": "image3.png",
            "bbox": [0, 0, 100, 50],
            "page_idx": 2,
        },
        {"type": "text", "text": "Normal", "bbox": [0, 200, 100, 300], "page_idx": 0},
    ]
    images: dict[str, bytes] = {
        "image1.png": b"img_data_1",
        "image2.png": b"img_data_2",
        "image3.png": b"img_data_3",
    }
    # Make all images have the same hash
    mock_imagehash_phash.side_effect = [imagehash.hex_to_hash("f" * 16)] * 3

    filtered_list, filtered_images, _, _ = HeaderFooterFilter.filter_recurring_elements(
        content_list, images, page_height=1000, occurrence_threshold=2
    )

    assert len(filtered_list) == 2  # Keeps first image and text
    assert filtered_list[0]["type"] == "image"
    assert filtered_list[1].get("text") == "Normal"
    assert "image2.png" in filtered_images
    assert "image3.png" in filtered_images


def test_filter_recurring_elements_recurring_exact_text() -> None:
    """Test that recurring exact text in header zones is filtered out."""
    content_list: list[ContentItemDict] = [
        {
            "type": "text",
            "text": "Confidential",
            "bbox": [0, 0, 100, 50],
            "page_idx": 0,
        },
        {
            "type": "text",
            "text": "Confidential",
            "bbox": [0, 0, 100, 50],
            "page_idx": 1,
        },
        {
            "type": "text",
            "text": "Confidential",
            "bbox": [0, 0, 100, 50],
            "page_idx": 2,
        },
        {"type": "text", "text": "Normal", "bbox": [0, 200, 100, 300], "page_idx": 0},
    ]
    images: dict[str, bytes] = {}

    filtered_list, _, _, filtered_text = HeaderFooterFilter.filter_recurring_elements(
        content_list, images, page_height=1000, occurrence_threshold=2
    )

    assert len(filtered_list) == 2  # Keeps first text and normal text
    assert filtered_list[0].get("text") == "Confidential"
    assert filtered_list[1].get("text") == "Normal"
    assert "Confidential" in filtered_text


# --- Tests for find_duplicate_images ---


def test_find_duplicate_images_no_images() -> None:
    """find_duplicate_images returns empty set when no images present."""
    content_list: list[ContentItemDict] = [
        {"type": "text", "text": "Hello", "page_idx": 0},
    ]
    result = HeaderFooterFilter.find_duplicate_images(content_list, {})
    assert result == set()


def test_find_duplicate_images_no_duplicates(mock_image_open: Any, mock_imagehash_phash: Any) -> None:
    """find_duplicate_images returns empty set when all images are unique."""
    content_list: list[ContentItemDict] = [
        {"type": "image", "img_path": "img1.png", "page_idx": 0, "bbox": [0, 0, 100, 100]},
        {"type": "image", "img_path": "img2.png", "page_idx": 1, "bbox": [0, 0, 100, 100]},
    ]
    image_bytes = {"img1.png": b"data1", "img2.png": b"data2"}
    # Different hashes -> no duplicates
    mock_imagehash_phash.side_effect = [
        imagehash.hex_to_hash("a" * 16),
        imagehash.hex_to_hash("0" * 16),
    ]

    result = HeaderFooterFilter.find_duplicate_images(content_list, image_bytes)
    assert result == set()


def test_find_duplicate_images_with_duplicates(mock_image_open: Any, mock_imagehash_phash: Any) -> None:
    """find_duplicate_images identifies duplicate images, keeps first occurrence."""
    content_list: list[ContentItemDict] = [
        {"type": "image", "img_path": "logo_p0.png", "page_idx": 0, "bbox": [0, 0, 50, 50]},
        {"type": "image", "img_path": "logo_p1.png", "page_idx": 1, "bbox": [0, 0, 50, 50]},
        {"type": "image", "img_path": "logo_p2.png", "page_idx": 2, "bbox": [0, 0, 50, 50]},
        {"type": "image", "img_path": "unique.png", "page_idx": 0, "bbox": [0, 200, 100, 300]},
    ]
    image_bytes = {
        "logo_p0.png": b"logo_data",
        "logo_p1.png": b"logo_data",
        "logo_p2.png": b"logo_data",
        "unique.png": b"unique_data",
    }
    # First 3 images get same hash, 4th is different
    same_hash = imagehash.hex_to_hash("f" * 16)
    diff_hash = imagehash.hex_to_hash("0" * 16)
    mock_imagehash_phash.side_effect = [same_hash, same_hash, same_hash, diff_hash]

    result = HeaderFooterFilter.find_duplicate_images(content_list, image_bytes)
    assert "logo_p1.png" in result
    assert "logo_p2.png" in result
    assert "logo_p0.png" not in result  # First occurrence kept
    assert "unique.png" not in result


def test_find_duplicate_images_includes_tables(mock_image_open: Any, mock_imagehash_phash: Any) -> None:
    """find_duplicate_images also deduplicates table images."""
    content_list: list[ContentItemDict] = [
        {"type": "table", "img_path": "table_p0.png", "page_idx": 0, "bbox": [0, 0, 100, 100]},
        {"type": "table", "img_path": "table_p1.png", "page_idx": 1, "bbox": [0, 0, 100, 100]},
        {"type": "image", "img_path": "photo.png", "page_idx": 0, "bbox": [0, 200, 100, 300]},
    ]
    image_bytes = {
        "table_p0.png": b"table_data",
        "table_p1.png": b"table_data",
        "photo.png": b"photo_data",
    }
    same_hash = imagehash.hex_to_hash("f" * 16)
    diff_hash = imagehash.hex_to_hash("0" * 16)
    mock_imagehash_phash.side_effect = [same_hash, same_hash, diff_hash]

    result = HeaderFooterFilter.find_duplicate_images(content_list, image_bytes)
    assert "table_p1.png" in result
    assert "table_p0.png" not in result
    assert "photo.png" not in result


def test_find_duplicate_images_handles_images_prefix(mock_image_open: Any, mock_imagehash_phash: Any) -> None:
    """find_duplicate_images resolves 'images/' prefix in img_path."""
    content_list: list[ContentItemDict] = [
        {"type": "image", "img_path": "images/logo.png", "page_idx": 0, "bbox": [0, 0, 50, 50]},
        {"type": "image", "img_path": "images/logo2.png", "page_idx": 1, "bbox": [0, 0, 50, 50]},
    ]
    # Image bytes dict uses filenames without prefix
    image_bytes = {"logo.png": b"data1", "logo2.png": b"data2"}
    same_hash = imagehash.hex_to_hash("f" * 16)
    mock_imagehash_phash.side_effect = [same_hash, same_hash]

    result = HeaderFooterFilter.find_duplicate_images(content_list, image_bytes)
    assert "images/logo2.png" in result
    assert "images/logo.png" not in result


def test_filter_recurring_elements_includes_table_images(mock_image_open: Any, mock_imagehash_phash: Any) -> None:
    """filter_recurring_elements also deduplicates table images (not just image/img types)."""
    content_list: list[ContentItemDict] = [
        {"type": "table", "img_path": "info_box_p0.png", "page_idx": 0, "bbox": [0, 500, 100, 600]},
        {"type": "table", "img_path": "info_box_p1.png", "page_idx": 1, "bbox": [0, 500, 100, 600]},
        {"type": "text", "text": "Normal text", "bbox": [0, 300, 100, 400], "page_idx": 0},
    ]
    images: dict[str, bytes] = {
        "info_box_p0.png": b"box_data",
        "info_box_p1.png": b"box_data",
    }
    same_hash = imagehash.hex_to_hash("f" * 16)
    mock_imagehash_phash.side_effect = [same_hash, same_hash]

    filtered_list, filtered_images, _, _ = HeaderFooterFilter.filter_recurring_elements(
        content_list, images, page_height=1000, occurrence_threshold=2
    )

    assert len(filtered_list) == 2  # First table + text
    assert filtered_list[0]["type"] == "table"
    assert filtered_list[0].get("img_path") == "info_box_p0.png"
    assert "info_box_p1.png" in filtered_images
