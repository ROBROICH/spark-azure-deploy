import io
import stat
import zipfile

import pytest

from src.services.zip_utils import (
    MAX_COMPRESSION_RATIO,
    MAX_SINGLE_ENTRY_SIZE_BYTES,
    MAX_ZIP_ENTRIES,
    MAX_ZIP_EXTRACTION_SIZE_BYTES,
    validate_zip_metadata,
)


def _create_zip_in_memory(
    entries: list[tuple[str, bytes]],
    *,
    dirs: list[str] | None = None,
) -> zipfile.ZipFile:
    """Create an in-memory ZipFile with the given entries."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
        for name, data in entries:
            zf.writestr(name, data)
        if dirs:
            for d in dirs:
                zf.mkdir(d)
    buf.seek(0)
    return zipfile.ZipFile(buf, "r")


class TestValidateZipMetadata:
    def test_valid_zip_returns_entries(self):
        entries = [("a.pdf", b"pdf-data"), ("b.txt", b"hello")]
        with _create_zip_in_memory(entries) as zf:
            result = validate_zip_metadata(zf, "test.zip")
        assert len(result) == 2
        assert {e.filename for e in result} == {"a.pdf", "b.txt"}

    def test_directories_are_filtered(self):
        entries = [("file.pdf", b"data")]
        with _create_zip_in_memory(entries, dirs=["subdir"]) as zf:
            result = validate_zip_metadata(zf, "test.zip")
        assert len(result) == 1
        assert result[0].filename == "file.pdf"

    def test_too_many_entries_raises(self):
        entries = [(f"file_{i}.txt", b"x") for i in range(MAX_ZIP_ENTRIES + 1)]
        with _create_zip_in_memory(entries) as zf, pytest.raises(ValueError, match="exceeding limit"):
            validate_zip_metadata(zf, "test.zip")

    def test_oversized_single_entry_raises(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
            # Fake a large file_size via ZipInfo
            info = zipfile.ZipInfo("big.bin")
            info.file_size = 11 * 1024 * 1024 * 1024  # 11 GB
            info.compress_size = 11 * 1024 * 1024 * 1024
            # We can't actually write 11GB, so we manipulate the header
            zf.writestr(info, b"small")
        buf.seek(0)
        # Re-open and patch the entry's file_size
        zf = zipfile.ZipFile(buf, "r")
        zf.infolist()[0].file_size = 11 * 1024 * 1024 * 1024
        with pytest.raises(ValueError, match="exceeding limit"):
            validate_zip_metadata(zf, "test.zip")
        zf.close()

    def test_zip_bomb_high_ratio_raises(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            # Highly compressible data
            zf.writestr("bomb.txt", b"\x00" * (1024 * 1024))
        buf.seek(0)
        zf = zipfile.ZipFile(buf, "r")
        entry = zf.infolist()[0]
        # Ensure ratio exceeds limit by patching if needed
        if entry.compress_size > 0:
            actual_ratio = entry.file_size / entry.compress_size
            if actual_ratio <= MAX_COMPRESSION_RATIO:
                # Force a high ratio by lowering compress_size
                entry.compress_size = 1
        with pytest.raises(ValueError, match="zip bomb"):
            validate_zip_metadata(zf, "test.zip")
        zf.close()

    def test_total_size_exceeds_limit_raises(self):
        per_entry_size = MAX_SINGLE_ENTRY_SIZE_BYTES - 1
        required_entries = (MAX_ZIP_EXTRACTION_SIZE_BYTES // per_entry_size) + 1

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
            for i in range(required_entries):
                zf.writestr(f"{i}.txt", b"x")
        buf.seek(0)

        zf = zipfile.ZipFile(buf, "r")

        for entry in zf.infolist():
            entry.file_size = per_entry_size
            entry.compress_size = per_entry_size

        with pytest.raises(ValueError, match="total uncompressed size"):
            validate_zip_metadata(zf, "test.zip")

        zf.close()

    def test_symlinks_are_filtered(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            # Normal file
            zf.writestr("normal.txt", "hello")
            # Fake symlink entry
            info = zipfile.ZipInfo("link.txt")
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            zf.writestr(info, "/etc/passwd")
        buf.seek(0)
        with zipfile.ZipFile(buf, "r") as zf:
            result = validate_zip_metadata(zf, "test.zip")
        assert len(result) == 1
        assert result[0].filename == "normal.txt"

    def test_empty_zip_returns_empty_list(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            pass  # empty
        buf.seek(0)
        with zipfile.ZipFile(buf, "r") as zf:
            result = validate_zip_metadata(zf, "empty.zip")
        assert result == []
