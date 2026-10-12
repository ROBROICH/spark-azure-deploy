"""zipfile helpers"""
import stat
import zipfile
from collections.abc import Collection
from pathlib import Path, PurePosixPath
from zipfile import BadZipFile

# Unix file mode is stored in the upper 16 bits of ``external_attr``.
_EXTERNAL_ATTR_MODE_SHIFT = 16

DEFAULT_ALLOWED_SUFFIXES: frozenset[str] = frozenset({".xml"})


def extract_and_validate(
    zip_path: Path,
    output_dir: Path,
    allowed_suffixes: Collection[str] = DEFAULT_ALLOWED_SUFFIXES,
    allowed_names: Collection[str] = (),
) -> None:
    """Extract a zip file into ``output_dir`` while guarding against zip-slip.

    Every archive member is validated *before* anything is written: the
    resolved destination must stay inside ``output_dir``, no member may be a
    symlink and every file must either have one of ``allowed_suffixes``
    (case-insensitive) or match one of ``allowed_names`` by its full member
    path. If any member fails validation, nothing is extracted.

    Raises:
        BadZipFile: if ``zip_path`` is not a valid zip file, or a member would
            escape ``output_dir`` (zip-slip), is a symlink or is not allowed.
    """
    if not zipfile.is_zipfile(zip_path):
        raise BadZipFile(f"{zip_path} is not a valid zip file.")

    output_dir = output_dir.resolve()
    suffixes = {suffix.lower() for suffix in allowed_suffixes}

    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        for file_info in zip_ref.infolist():
            if not file_info.is_dir() and not (
                PurePosixPath(file_info.filename).suffix.lower() in suffixes
                or file_info.filename in allowed_names
            ):
                raise BadZipFile(
                    f"{zip_path} contains a file type that is not allowed "
                    f"({file_info.filename}), refusing to extract."
                )

            mode = file_info.external_attr >> _EXTERNAL_ATTR_MODE_SHIFT
            if stat.S_ISLNK(mode):
                raise BadZipFile(
                    f"{zip_path} contains a symlink ({file_info.filename}), refusing to extract."
                )

            target = (output_dir / file_info.filename).resolve()
            if not target.is_relative_to(output_dir):
                raise BadZipFile(
                    f"{zip_path} contains a member that escapes the output directory "
                    f"({file_info.filename}), refusing to extract."
                )

        zip_ref.extractall(output_dir)
