import unicodedata
import zipfile

import pytest

from src.services.zip_utils import normalize_zip_entry_name

_UTF8_FLAG = 0x800


def _zi(filename: str, utf8_flag: bool = True) -> zipfile.ZipInfo:
    """Build a ZipInfo with the given filename and UTF-8 flag bit."""
    info = zipfile.ZipInfo(filename=filename)
    if utf8_flag:
        info.flag_bits |= _UTF8_FLAG
    else:
        info.flag_bits &= ~_UTF8_FLAG
    return info


def _macos_finder_zi(filename_nfc: str) -> zipfile.ZipInfo:
    """Simulate macOS Finder: UTF-8 NFD bytes, UTF-8 flag NOT set.

    Python's ``zipfile`` would then decode those bytes as CP437,
    yielding a mangled str. We construct that exact mangled str here
    so the test exercises the recovery path.
    """
    nfd_bytes = unicodedata.normalize("NFD", filename_nfc).encode("utf-8")
    mangled = nfd_bytes.decode("cp437")
    return _zi(mangled, utf8_flag=False)


@pytest.mark.parametrize(
    "entry, expected",
    [
        # --- macOS Finder mangled umlauts (UTF-8 NFD bytes decoded as CP437) ---
        (_macos_finder_zi("Erläuterung.pdf"), "Erläuterung.pdf"),
        (_macos_finder_zi("Ärger.pdf"), "Ärger.pdf"),
        (_macos_finder_zi("Öl.pdf"), "Öl.pdf"),
        (_macos_finder_zi("Übung.pdf"), "Übung.pdf"),
        (_macos_finder_zi("docs/Größe.pdf"), "docs/Größe.pdf"),
        (_macos_finder_zi("docs/Maßstab_für_Prüfung.pdf"), "docs/Maßstab_für_Prüfung.pdf"),
        # --- Correct UTF-8 (flag set), already NFC ---
        (_zi("docs/Erläuterungsbericht.pdf"), "docs/Erläuterungsbericht.pdf"),
        (_zi("docs/Straße.pdf"), "docs/Straße.pdf"),
        (_zi("Ärger_Öl_Übung.pdf"), "Ärger_Öl_Übung.pdf"),
        # --- UTF-8 flag set but filename is NFD → still normalized to NFC ---
        (_zi(unicodedata.normalize("NFD", "Erläuterung.pdf")), "Erläuterung.pdf"),
        # --- Valid paths ---
        (_zi("report.pdf"), "report.pdf"),
        (_zi("docs/report.pdf"), "docs/report.pdf"),
        (_zi("a/b/c.txt"), "a/b/c.txt"),
        # --- Backslash → forward slash ---
        (_zi("folder\\sub\\file.json"), "folder/sub/file.json"),
        # --- Dot segments collapsed ---
        (_zi("folder/./file.pdf"), "folder/file.pdf"),
        # --- Trailing slash/backslash = directory → filtered ---
        (_zi("somedir/"), None),
        (_zi("somedir\\"), None),
        # --- Path traversal → filtered ---
        (_zi("../escape.pdf"), None),
        (_zi("nested/../blocked.pdf"), None),
        (_zi("a/b/../../etc/passwd"), None),
        # --- __MACOSX prefix → filtered ---
        (_zi("__MACOSX/metadata.pdf"), None),
        (_zi("__MACOSX/._foo.pdf"), None),
        # --- Dot-underscore prefix → filtered ---
        (_zi("._hidden.pdf"), None),
        # --- Empty / degenerate ---
        (_zi(""), None),
        (_zi("/"), None),
    ],
)
def test_normalize_zip_entry_name(entry: zipfile.ZipInfo, expected: str | None) -> None:
    assert normalize_zip_entry_name(entry) == expected


def test_legacy_cp437_filename_preserved() -> None:
    """If cp437->utf-8 round-trip fails, keep the cp437-decoded string."""
    # 0xFF in CP437 is a non-breaking space (\xa0); valid cp437 but
    # 0xFF alone is not a valid utf-8 start byte → recovery falls back.
    info = _zi("file\xff.pdf", utf8_flag=False)
    result = normalize_zip_entry_name(info)
    assert result == unicodedata.normalize("NFC", "file\xff.pdf")


def test_validate_metadata_error_uses_recovered_filename() -> None:
    """ValueError messages from size/ratio checks must show the recovered name.

    macOS Finder zips trip these limits with NFD-encoded umlaut names; the
    user must see ``Erläuterung.pdf``, not the CP437-mangled form.
    """
    from src.services.zip_utils import validate_zip_metadata

    entry = _macos_finder_zi("Erläuterung.pdf")
    entry.file_size = 10**12  # blow past MAX_SINGLE_ENTRY_SIZE_BYTES
    entry.compress_size = 1

    class _FakeZipFile:
        def infolist(self) -> list[zipfile.ZipInfo]:
            return [entry]

    with pytest.raises(ValueError, match="Erläuterung.pdf"):
        validate_zip_metadata(zf=_FakeZipFile(), zip_filename="upload.zip")  # type: ignore[arg-type]
