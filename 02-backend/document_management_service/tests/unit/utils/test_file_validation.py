import pytest

from src.services.files.file_validation import validate_file_upload
from src.utils.exceptions import (
    FileInvalidFileExtensionError,
)

# Test configuration constants
TEST_ALLOWED_EXTENSIONS = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".md": "text/markdown",
}

TEST_ALLOWED_MIME_TYPES = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/jpeg",
    "image/png",
    "text/markdown",
]


def test_validate_file_upload_success_pdf():
    mime_type = validate_file_upload(
        filename="document.pdf",
        allowed_extensions=TEST_ALLOWED_EXTENSIONS,
        allowed_mime_types=TEST_ALLOWED_MIME_TYPES,
    )
    assert mime_type == "application/pdf"


def test_validate_file_upload_unsupported_type():
    with pytest.raises(FileInvalidFileExtensionError):
        validate_file_upload(
            filename="document.txt",
            allowed_extensions=TEST_ALLOWED_EXTENSIONS,
            allowed_mime_types=TEST_ALLOWED_MIME_TYPES,
        )


def test_validate_file_upload_all_supported_types_and_case_insensitive():
    test_cases = [
        ("document.pdf", "application/pdf"),
        (
            "document.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
        (
            "spreadsheet.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
        ("image.jpg", "image/jpeg"),
        ("image.jpeg", "image/jpeg"),
        ("image.png", "image/png"),
        ("document.PDF", "application/pdf"),
        ("image.JPEG", "image/jpeg"),
    ]

    for filename, expected_mime in test_cases:
        mime = validate_file_upload(
            filename=filename,
            allowed_extensions=TEST_ALLOWED_EXTENSIONS,
            allowed_mime_types=TEST_ALLOWED_MIME_TYPES,
        )
        assert mime == expected_mime
