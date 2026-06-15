"""zipfile helpers"""
import stat
import zipfile
from zipfile import BadZipFile
from pathlib import Path

# Unix file mode is stored in the upper 16 bits of ``external_attr``.
_EXTERNAL_ATTR_MODE_SHIFT = 16


def extract_and_validate(zip_path: Path, output_dir: Path) -> None:
    """Extract a zip file into ``output_dir`` while guarding against zip-slip.

    Every archive member is validated *before* anything is written: the
    resolved destination must stay inside ``output_dir`` and no member may be a
    symlink. If any member fails validation, nothing is extracted.

    Raises:
        BadZipFile: if ``zip_path`` is not a valid zip file, or a member would
            escape ``output_dir`` (zip-slip) or is a symlink.
    """
    if not zipfile.is_zipfile(zip_path):
        raise BadZipFile(f"{zip_path} is not a valid zip file.")

    output_dir = output_dir.resolve()

    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        for file_info in zip_ref.infolist():
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
