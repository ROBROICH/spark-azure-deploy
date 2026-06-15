import stat
import unicodedata
import zipfile
from contextlib import suppress
from pathlib import PurePosixPath

from src.config.settings import settings

_ZIP_UTF8_FLAG = 0x800

MAX_ZIP_ENTRIES = settings.MAX_ZIP_ENTRIES
MAX_COMPRESSION_RATIO = settings.MAX_COMPRESSION_RATIO
MAX_ZIP_EXTRACTION_SIZE_BYTES = settings.MAX_ZIP_EXTRACTION_SIZE_BYTES
MAX_SINGLE_ENTRY_SIZE_BYTES = settings.MAX_SINGLE_ENTRY_SIZE_BYTES


def validate_zip_metadata(zf: zipfile.ZipFile, zip_filename: str) -> list[zipfile.ZipInfo]:
    """Validate ZIP metadata and return list of safe entries."""
    entries = zf.infolist()

    _validate_entry_count(entries, zip_filename)

    valid_entries: list[zipfile.ZipInfo] = []
    total_uncompressed = 0

    for entry in entries:
        if _should_skip_entry(entry):
            continue

        _validate_entry_size(entry, zip_filename)
        _validate_compression_ratio(entry, zip_filename)

        total_uncompressed += entry.file_size
        valid_entries.append(entry)

    _validate_total_size(total_uncompressed, zip_filename)

    return valid_entries


def _validate_entry_count(entries: list[zipfile.ZipInfo], zip_filename: str) -> None:
    if len(entries) > MAX_ZIP_ENTRIES:
        raise ValueError(f"ZIP '{zip_filename}' contains {len(entries)} entries, exceeding limit of {MAX_ZIP_ENTRIES}.")


def _should_skip_entry(entry: zipfile.ZipInfo) -> bool:
    if entry.is_dir():
        return True

    unix_mode = (entry.external_attr >> 16) & 0xFFFF
    return bool(unix_mode and stat.S_ISLNK(unix_mode))


def _validate_entry_size(entry: zipfile.ZipInfo, zip_filename: str) -> None:
    if entry.file_size > MAX_SINGLE_ENTRY_SIZE_BYTES:
        raise ValueError(
            f"Entry '{_recover_entry_filename(entry)}' in ZIP '{zip_filename}' is "
            f"{entry.file_size} bytes, exceeding limit of "
            f"{MAX_SINGLE_ENTRY_SIZE_BYTES} bytes."
        )


def _validate_compression_ratio(entry: zipfile.ZipInfo, zip_filename: str) -> None:
    if entry.compress_size == 0:
        return

    ratio = entry.file_size / entry.compress_size
    if ratio > MAX_COMPRESSION_RATIO:
        raise ValueError(
            f"Entry '{_recover_entry_filename(entry)}' in ZIP '{zip_filename}' has "
            f"compression ratio {ratio:.1f}:1, exceeding limit of "
            f"{MAX_COMPRESSION_RATIO}:1 (possible zip bomb)."
        )


def _validate_total_size(total_uncompressed: int, zip_filename: str) -> None:
    if total_uncompressed > MAX_ZIP_EXTRACTION_SIZE_BYTES:
        raise ValueError(
            f"ZIP '{zip_filename}' total uncompressed size is "
            f"{total_uncompressed} bytes, exceeding limit of "
            f"{MAX_ZIP_EXTRACTION_SIZE_BYTES} bytes."
        )


def _recover_entry_filename(entry: zipfile.ZipInfo) -> str:
    """Recover the true filename of a zip entry.

    macOS Finder writes UTF-8 (NFD) filename bytes without setting the
    UTF-8 general-purpose flag, causing Python's ``zipfile`` to fall back
    to CP437 decoding and mangle umlauts (e.g. ``Erläuterung`` becomes
    ``Erlo╠êuterung``). Reverse that mis-decode when possible, then
    NFC-normalize so downstream string comparisons behave.
    """
    name = entry.filename
    if not entry.flag_bits & _ZIP_UTF8_FLAG:
        with suppress(UnicodeEncodeError, UnicodeDecodeError):
            name = name.encode("cp437").decode("utf-8")

    return unicodedata.normalize("NFC", name)


def normalize_zip_entry_name(entry: zipfile.ZipInfo) -> str | None:
    """Return a safe relative file path from a zip entry."""
    entry_name = _recover_entry_filename(entry)

    if entry_name.endswith("/") or entry_name.endswith("\\"):
        return None

    normalized = entry_name.replace("\\", "/")
    parts: list[str] = []
    for part in normalized.split("/"):
        if not part or part == ".":
            continue
        if part == "..":
            return None
        parts.append(part)

    if not parts or parts[0] == "__MACOSX":
        return None

    relative_path = PurePosixPath(*parts).as_posix()
    if relative_path.startswith("._"):
        return None

    return relative_path
