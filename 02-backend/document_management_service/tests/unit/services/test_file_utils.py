import pytest

from src.services.files.file_utils import (
    get_file_extension,
    validate_file_by_content_bytes,
    validate_file_type_by_extension,
    validate_mime_type_allowed,
)
from src.utils.exceptions import (
    FileInvalidFileExtensionError,
    FileInvalidFileTypeError,
)


class TestFileExtension:
    """Test file extension extraction."""

    def test_get_file_extension_normal(self):
        """Test extracting extension from normal filename."""
        assert get_file_extension("document.pdf") == ".pdf"
        assert get_file_extension("image.jpeg") == ".jpeg"
        assert get_file_extension("spreadsheet.xlsx") == ".xlsx"

    def test_get_file_extension_case_insensitive(self):
        """Test that extension extraction is case insensitive."""
        assert get_file_extension("document.PDF") == ".pdf"
        assert get_file_extension("IMAGE.JPEG") == ".jpeg"

    def test_get_file_extension_multiple_dots(self):
        """Test extension extraction with multiple dots in filename."""
        assert get_file_extension("file.name.with.dots.pdf") == ".pdf"

    def test_get_file_extension_no_extension(self):
        """Test filename without extension."""
        assert get_file_extension("filename_without_extension") == ""

    def test_get_file_extension_path(self):
        """Test extension extraction from path."""
        assert get_file_extension("/path/to/document.pdf") == ".pdf"


class TestMimeTypeValidation:
    """Test MIME type validation."""

    def test_validate_mime_type_allowed_valid(self):
        """Test validation of allowed MIME types."""
        allowed_types = {"application/pdf", "image/jpeg", "image/png"}

        result = validate_mime_type_allowed("application/pdf", allowed_types)
        assert result == "application/pdf"

    def test_validate_mime_type_allowed_invalid(self):
        """Test validation of disallowed MIME types."""
        allowed_types = {"application/pdf", "image/jpeg"}

        with pytest.raises(FileInvalidFileTypeError) as exc_info:
            validate_mime_type_allowed("text/plain", allowed_types)

        assert "not supported" in str(exc_info.value)
        assert "text/plain" in str(exc_info.value)


class TestFileTypeByExtension:
    """Test file type validation by extension."""

    def test_validate_file_type_by_extension_valid(self):
        """Test valid file extensions."""
        allowed_extensions = {
            ".pdf": "application/pdf",
            ".docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
        }

        result = validate_file_type_by_extension("document.pdf", allowed_extensions)
        assert result == "application/pdf"

        result = validate_file_type_by_extension("image.JPG", allowed_extensions)  # Case insensitive
        assert result == "image/jpeg"

    def test_validate_file_type_by_extension_invalid(self):
        """Test invalid file extensions."""
        allowed_extensions = {".pdf": "application/pdf"}

        with pytest.raises(FileInvalidFileExtensionError) as exc_info:
            validate_file_type_by_extension("document.txt", allowed_extensions)
        assert "not supported" in str(exc_info.value)
        assert ".pdf" in str(exc_info.value)  # Should list allowed types


class TestValidateFileByContentBytes:
    """Test file validation by raw content bytes using magic numbers."""

    def test_validate_file_by_content_bytes_valid_pdf(self):
        """Test validation of valid PDF content."""
        pdf_bytes = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj"
        allowed_types = {"application/pdf"}
        validate_file_by_content_bytes(pdf_bytes, allowed_types)

    def test_validate_file_by_content_bytes_valid_png(self):
        """Test validation of valid PNG content."""
        png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        allowed_types = {"image/png"}
        validate_file_by_content_bytes(png_bytes, allowed_types)

    def test_validate_file_by_content_bytes_valid_jpeg(self):
        """Test validation of valid JPEG content."""
        jpeg_bytes = b"\xff\xd8\xff\xe0\x00\x10JFIF"
        allowed_types = {"image/jpeg"}
        validate_file_by_content_bytes(jpeg_bytes, allowed_types)

    def test_validate_file_by_content_bytes_disallowed_type(self):
        """Test validation fails for disallowed file type."""
        pdf_bytes = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj"
        allowed_types = {"image/jpeg", "image/png"}

        with pytest.raises(FileInvalidFileTypeError) as exc_info:
            validate_file_by_content_bytes(pdf_bytes, allowed_types)

        assert "not allowed" in str(exc_info.value)
        assert "application/pdf" in str(exc_info.value)

    def test_validate_file_by_content_bytes_empty_content(self):
        """Test validation with empty content."""
        allowed_types = {"application/pdf"}
        with pytest.raises(FileInvalidFileTypeError) as exc_info:
            validate_file_by_content_bytes(b"", allowed_types)
        assert "not allowed" in str(exc_info.value)

    def test_validate_file_by_content_bytes_text_file_disallowed(self):
        """Test that text files are properly detected and rejected."""
        text_bytes = b"Hello, this is plain text content"
        allowed_types = {"application/pdf", "image/jpeg"}

        with pytest.raises(FileInvalidFileTypeError) as exc_info:
            validate_file_by_content_bytes(text_bytes, allowed_types)

        assert "not allowed" in str(exc_info.value)

    def test_validate_file_by_content_bytes_csv_does_not_use_puremagic(self, monkeypatch):
        """CSV is validated structurally because it has no reliable magic bytes."""

        def fail_if_called(*args, **kwargs):
            raise AssertionError("puremagic should not be used for CSV content")

        monkeypatch.setattr("src.services.files.file_utils.puremagic.from_string", fail_if_called)

        validate_file_by_content_bytes(
            b"argument,erwiderung\nA,B\n",
            {"text/csv"},
            expected_mime_type="text/csv",
        )

    def test_validate_file_by_content_bytes_csv_rejects_binary_content(self):
        """CSV validation rejects binary payloads even without puremagic."""
        with pytest.raises(FileInvalidFileTypeError) as exc_info:
            validate_file_by_content_bytes(
                b"argument,erwiderung\nA,\x00B\n",
                {"text/csv"},
                expected_mime_type="text/csv",
            )

        assert "binary data" in str(exc_info.value)

    def test_validate_file_by_content_bytes_csv_rejects_empty_content(self):
        """CSV validation rejects empty payloads."""
        with pytest.raises(FileInvalidFileTypeError) as exc_info:
            validate_file_by_content_bytes(
                b"",
                {"text/csv"},
                expected_mime_type="text/csv",
            )

        assert "empty" in str(exc_info.value)

    def test_validate_file_by_content_bytes_csv_accepts_bom_prefixed_content(self):
        """CSV validation accepts a UTF-8 BOM prefix (e.g. Excel exports)."""
        validate_file_by_content_bytes(
            b"\xef\xbb\xbfargument,erwiderung\nA,B\n",
            {"text/csv"},
            expected_mime_type="text/csv",
        )

    def test_validate_file_by_content_bytes_csv_rejects_bom_only_content(self):
        """CSV validation rejects a file containing only a BOM."""
        with pytest.raises(FileInvalidFileTypeError) as exc_info:
            validate_file_by_content_bytes(
                b"\xef\xbb\xbf",
                {"text/csv"},
                expected_mime_type="text/csv",
            )

        assert "empty" in str(exc_info.value)

    def test_validate_file_by_content_bytes_csv_rejects_non_utf8_content(self):
        """CSV validation rejects bytes that are not valid UTF-8."""
        with pytest.raises(FileInvalidFileTypeError) as exc_info:
            validate_file_by_content_bytes(
                b"argument,erwiderung\nCaf\xe9,B\n",
                {"text/csv"},
                expected_mime_type="text/csv",
            )

        assert "UTF-8" in str(exc_info.value)

    def test_validate_file_by_content_bytes_csv_rejects_blank_header_row(self):
        """CSV validation rejects a header row with only whitespace cells."""
        with pytest.raises(FileInvalidFileTypeError) as exc_info:
            validate_file_by_content_bytes(
                b" , ,\t\nA,B,C\n",
                {"text/csv"},
                expected_mime_type="text/csv",
            )

        assert "header" in str(exc_info.value)

    def test_validate_file_by_content_bytes_csv_not_allowed_falls_through(self):
        """CSV short-circuit does not apply when text/csv is not allowed."""
        with pytest.raises(FileInvalidFileTypeError) as exc_info:
            validate_file_by_content_bytes(
                b"argument,erwiderung\nA,B\n",
                {"application/pdf"},
                expected_mime_type="text/csv",
            )

        assert "not allowed" in str(exc_info.value)

    def test_validate_file_by_content_bytes_csv_rejects_shebang_script(self):
        """A script with a shebang is rejected even with a CSV MIME type."""
        with pytest.raises(FileInvalidFileTypeError) as exc_info:
            validate_file_by_content_bytes(
                b"#!/bin/sh\nrm -rf /\n",
                {"text/csv"},
                expected_mime_type="text/csv",
            )

        assert "script" in str(exc_info.value)
