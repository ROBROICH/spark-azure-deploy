"""Shared wrapper around the ocrmypdf CLI."""

import logging
import shutil
import subprocess
from pathlib import Path

from src.env import ENV

logger = logging.getLogger(__name__)


class OcrTimeoutError(RuntimeError):
    """Raised when the OCR subprocess exceeds its configured runtime limit."""


def run_ocrmypdf(
    input_path: str | Path,
    output_path: str | Path,
    pages: list[int],
    *,
    lang: str = "deu",
    rotate_pages: bool = False,
    deskew: bool = False,
    optimize: int | None = None,
) -> None:
    """Run ocrmypdf on *pages* (0-based) writing the result to *output_path*.

    Raises ``FileNotFoundError`` if the binary is missing and
    ``RuntimeError`` for non-zero exit codes (exit 4 — non-fatal
    warnings — is accepted).
    """
    ocrmypdf_bin = shutil.which("ocrmypdf")
    if not ocrmypdf_bin:
        raise FileNotFoundError("ocrmypdf not found on PATH")

    # ocrmypdf uses 1-based page numbers
    page_spec = ",".join(str(p + 1) for p in pages)

    cmd: list[str] = [
        ocrmypdf_bin,
        "-l", lang,
        "-j", str(ENV.OCR_JOBS),
        "--force-ocr",
        "--pages", page_spec,
        "--output-type", "pdf",
    ]
    if rotate_pages:
        cmd.append("--rotate-pages")
    if deskew:
        cmd.append("--deskew")
    if optimize is not None:
        cmd += ["--optimize", str(optimize)]
    cmd += [str(input_path), str(output_path)]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=ENV.OCR_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        raise OcrTimeoutError(
            f"ocrmypdf exceeded timeout of {ENV.OCR_TIMEOUT_SECONDS} seconds"
        ) from exc

    if result.returncode not in (0, 4):
        logger.error("ocrmypdf failed (exit %d): %s", result.returncode, result.stderr[:500])
        raise RuntimeError(f"ocrmypdf exited with {result.returncode}: {result.stderr}")
