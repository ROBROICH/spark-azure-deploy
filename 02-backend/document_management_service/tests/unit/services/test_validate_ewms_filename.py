"""Unit tests for _validate_ewms_filename function in extract_zip activity."""

from src.services.workflows.activities.extract_zip import _validate_ewms_filename


class TestValidateEwmsFilename:
    """Test suite for EWMS filename validation."""

    def test_valid_filenames_without_path(self):
        """Test valid filenames without any path elements."""
        valid_filenames = [
            "E1234.pdf",
            "E9999_report.pdf",
            "S0000-document.docx",
            "N5678_final_version.pdf",
            "E1234_1929968711-typed.pdf",
            "S8689_8243804475-typed.pdf",
            "E0001.txt",
            "N9999_anything_after_pattern.pdf",
        ]
        for filename in valid_filenames:
            assert _validate_ewms_filename(filename), f"Expected {filename} to be valid"

    def test_valid_filenames_with_single_folder(self):
        """Test valid filenames with a single folder prefix."""
        valid_filenames = [
            "output/E9952_1929968711-typed.pdf",
            "folder/E1234.pdf",
            "documents/S5678_report.pdf",
            "temp/N0000-file.docx",
        ]
        for filename in valid_filenames:
            assert _validate_ewms_filename(filename), f"Expected {filename} to be valid"

    def test_valid_filenames_with_nested_folders(self):
        """Test valid filenames with multiple nested folder prefixes."""
        valid_filenames = [
            "folder1/folder2/E1234.pdf",
            "a/b/c/d/S5678_document.pdf",
            "output/subfolder/N9999_file.pdf",
            "deeply/nested/path/structure/E0001.txt",
            "contains-invalid-files/E8689_8243804475-typed.pdf",
        ]
        for filename in valid_filenames:
            assert _validate_ewms_filename(filename), f"Expected {filename} to be valid"

    def test_invalid_filenames_lowercase_prefix(self):
        """Test that lowercase E, S, N prefixes are invalid."""
        invalid_filenames = [
            "e1234.pdf",
            "s5678.pdf",
            "n9999.pdf",
            "output/e1234.pdf",
            "folder/s5678_report.pdf",
        ]
        for filename in invalid_filenames:
            assert not _validate_ewms_filename(filename), f"Expected {filename} to be invalid"

    def test_invalid_filenames_wrong_digit_count(self):
        """Test that filenames with wrong number of digits are invalid."""
        invalid_filenames = [
            "E123.pdf",
            "S1.pdf",
            "N12.pdf",
            "output/E123.pdf",
        ]
        for filename in invalid_filenames:
            assert not _validate_ewms_filename(filename), f"Expected {filename} to be invalid"

        # Note: E12345.pdf (5 digits) is actually VALID because the pattern allows
        # any characters after the first 4 digits (E1234 + 5.pdf)
        assert _validate_ewms_filename("E12345.pdf")
        assert _validate_ewms_filename("folder/S12345_report.pdf")

    def test_invalid_filenames_pattern_not_at_start(self):
        """Test that filenames where pattern is not at the start of basename are invalid."""
        invalid_filenames = [
            "document_E1234.pdf",
            "report_S5678.pdf",
            "file_N9999.pdf",
            "ABC-S8689_8243804475-typed.pdf",
            "prefix_E1234.pdf",
            "output/document_E1234.pdf",
            "folder/ABC-S8689.pdf",
        ]
        for filename in invalid_filenames:
            assert not _validate_ewms_filename(filename), f"Expected {filename} to be invalid"

    def test_invalid_filenames_wrong_letter(self):
        """Test that filenames with letters other than E, S, N are invalid."""
        invalid_filenames = [
            "A1234.pdf",
            "B5678.pdf",
            "Z9999.pdf",
            "X0000.pdf",
            "output/A1234.pdf",
            "folder/Z9999_report.pdf",
        ]
        for filename in invalid_filenames:
            assert not _validate_ewms_filename(filename), f"Expected {filename} to be invalid"

    def test_invalid_filenames_no_extension(self):
        """Test that filenames without extension are still validated correctly."""
        # Valid pattern without extension
        assert _validate_ewms_filename("E1234")
        assert _validate_ewms_filename("output/S5678")

        # Invalid pattern without extension
        assert not _validate_ewms_filename("e1234")
        assert not _validate_ewms_filename("output/ABC-E1234")

    def test_edge_cases(self):
        """Test edge cases and special scenarios."""
        # Empty string
        assert not _validate_ewms_filename("")

        # Just the pattern
        assert _validate_ewms_filename("E1234")
        assert _validate_ewms_filename("S5678")
        assert _validate_ewms_filename("N9999")

        # Pattern with special characters after
        assert _validate_ewms_filename("E1234-_@#$.pdf")
        assert _validate_ewms_filename("output/S5678-_@#$.pdf")

        # Note: Windows-style paths with backslashes work differently on Unix vs Windows
        # On Unix, backslash is a valid filename character, not a path separator
        # So "folder\\E1234.pdf" is treated as a single filename containing backslashes
        # This is platform-dependent behavior, so we test Unix behavior here
        assert not _validate_ewms_filename("folder\\E1234.pdf")  # Unix: filename is "folder\E1234.pdf"

    def test_real_world_examples(self):
        """Test with real-world example filenames from the issue."""
        # The specific example from the task
        assert _validate_ewms_filename("output/E9952_1929968711-typed.pdf")

        # Similar real-world patterns
        assert _validate_ewms_filename("output/E1234_1234567890-typed.pdf")
        assert _validate_ewms_filename("documents/processed/S5678_9876543210-final.pdf")
        assert _validate_ewms_filename("archive/2024/N9999_1111111111-signed.pdf")

        # Invalid real-world patterns
        assert not _validate_ewms_filename("output/ABC-E9952_1929968711-typed.pdf")
        assert not _validate_ewms_filename("documents/invalid_E1234.pdf")
