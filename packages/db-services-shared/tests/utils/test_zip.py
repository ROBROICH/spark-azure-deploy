"""tests for the zip extraction helper"""
import zipfile
from pathlib import Path
from zipfile import BadZipFile

import pytest
from db_services_shared.utils.zip import extract_and_validate


def _make_zip(path: Path, members: dict[str, bytes]) -> Path:
    with zipfile.ZipFile(path, "w") as zf:
        for name, content in members.items():
            zf.writestr(name, content)
    return path


def test_rejects_pickle_next_to_xml(tmp_path: Path) -> None:
    """an archive smuggling a chunk cache must not leave any file behind"""
    zip_path = _make_zip(
        tmp_path / "doc.zip",
        {"X.xml": b"<dokument/>", "X.chunks.pkl": b"not a real pickle"},
    )
    output_dir = tmp_path / "out"
    output_dir.mkdir()

    with pytest.raises(BadZipFile, match=r"X\.chunks\.pkl"):
        extract_and_validate(zip_path, output_dir)

    assert list(output_dir.rglob("*")) == []


def test_extracts_xml_only_by_default(tmp_path: Path) -> None:
    zip_path = _make_zip(tmp_path / "doc.zip", {"X.xml": b"<dokument/>"})
    output_dir = tmp_path / "out"

    extract_and_validate(zip_path, output_dir)

    assert (output_dir / "X.xml").read_bytes() == b"<dokument/>"


def test_rejects_image_unless_allowed(tmp_path: Path) -> None:
    zip_path = _make_zip(tmp_path / "law.zip", {"law.xml": b"<x/>", "img.JPG": b"\xff\xd8"})

    with pytest.raises(BadZipFile, match=r"img\.JPG"):
        extract_and_validate(zip_path, tmp_path / "strict")

    extract_and_validate(zip_path, tmp_path / "out", allowed_suffixes={".xml", ".jpg"})
    assert (tmp_path / "out" / "img.JPG").exists()


def test_allows_exact_names_and_directories(tmp_path: Path) -> None:
    """some law archives ship a suffix-less ``mimetype`` file"""
    zip_path = _make_zip(
        tmp_path / "law.zip",
        {
            "norm/": b"",
            "norm/Law.xml": b"<x/>",
            "META-INF/manifest.xml": b"<m/>",
            "mimetype": b"application/zip",
        },
    )
    output_dir = tmp_path / "out"

    extract_and_validate(zip_path, output_dir, allowed_names={"mimetype"})

    assert (output_dir / "norm" / "Law.xml").exists()
    assert (output_dir / "mimetype").exists()


def test_allowed_names_match_full_member_path(tmp_path: Path) -> None:
    zip_path = _make_zip(tmp_path / "law.zip", {"nested/mimetype": b"x"})

    with pytest.raises(BadZipFile, match="nested/mimetype"):
        extract_and_validate(zip_path, tmp_path / "out", allowed_names={"mimetype"})
