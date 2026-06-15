import asyncio
import os
import re
import zipfile
from io import BytesIO
from typing import IO, cast
from uuid import UUID

from temporalio import activity

from src.config.settings import settings
from src.models.db.database import AsyncSessionLocal
from src.models.db.workflow_enum import ActionEnum, ErrorCode
from src.services.files.file_service import FileService
from src.services.files.file_validation import validate_file_upload
from src.services.virus_scan import scan_bytes
from src.services.workflows.activities.activity_models import (
    ExtractZipInput,
    SingleFileResult,
)
from src.services.workflows.activities.activity_utils import (
    get_s3_context,
)
from src.services.zip_utils import normalize_zip_entry_name, validate_zip_metadata
from src.utils.exceptions import (
    FileInvalidFileExtensionError,
    FileInvalidFileTypeError,
    FileVirusDetectedError,
    VirusScanUnavailableError,
)
from src.utils.service_utils import create_file_service


def _validate_ewms_filename(filename: str) -> bool:
    """Validate EWMS filename format: [ESN]#### at start, then any characters.

    The first 5 characters must be one letter (E, S, or N) followed by exactly
    4 digits. Any characters are allowed after that. Path elements before the
    filename are ignored.

    Args:
        filename: The filename or path to validate (e.g., "output/E9952_1929968711-typed.pdf")

    Returns:
        True if filename starts with [ESN] + 4 digits, False otherwise

    Examples:
        Valid: E1234.pdf, E1234_report.pdf, S5678-document-final.docx, output/E9952_1929968711-typed.pdf
        Invalid: e1234.pdf (lowercase), E123.pdf (3 digits), document_E1234.pdf (not at start)
    """
    # Extract only the filename, ignoring any path elements
    basename = os.path.basename(filename)

    pattern = r"^[ESN]\d{4}.*$"
    return bool(re.match(pattern, basename))


def _invalid_filename_result(filename: str) -> SingleFileResult:
    """Build the error result for an entry whose name fails EWMS validation."""
    return SingleFileResult(
        success=False,
        filename=filename,
        error_code=ErrorCode.INVALID_FILENAME,
        error_message="Filename must start with [ESN]#### pattern (e.g., E1234.pdf, E1234_report.pdf",
        action=ActionEnum.UNZIP,
    )


async def _read_zip_metadata(fs, source_s3_path: str, zip_filename: str) -> list[zipfile.ZipInfo]:
    """Open the ZIP from S3 and return its validated list of entries."""

    def _get_zip_metadata() -> list[zipfile.ZipInfo]:
        with fs.open(source_s3_path, "rb") as f, zipfile.ZipFile(cast(IO[bytes], f)) as zf:
            return validate_zip_metadata(zf=zf, zip_filename=zip_filename)

    return await asyncio.to_thread(_get_zip_metadata)


async def _read_zip_entry(fs, source_s3_path: str, entry_info: zipfile.ZipInfo) -> bytes:
    """Read the raw bytes of a single ZIP entry from S3."""

    def _read_entry() -> bytes:
        with (
            fs.open(source_s3_path, "rb") as f,
            zipfile.ZipFile(cast(IO[bytes], f)) as zf,
        ):
            return zf.read(entry_info)

    return await asyncio.to_thread(_read_entry)


async def _delete_source_zip(fs, source_s3_path: str) -> None:
    """Delete the source ZIP from the upload bucket, logging on failure."""
    try:

        def _delete() -> None:
            fs.rm(source_s3_path)

        await asyncio.to_thread(_delete)
    except Exception:
        activity.logger.warning(f"Failed to delete ZIP from upload source bucket: {source_s3_path}")


async def _scan_for_viruses(content: bytes, relative_filename: str) -> None:
    """Scan entry content for viruses, raising if a threat is detected.

    Raises:
        FileVirusDetectedError: if the content is not clean.
        VirusScanUnavailableError: if the scanner is unavailable (propagated).
    """
    scan_result = await scan_bytes(content, settings.CLAMAV)
    if not scan_result.is_clean:
        raise FileVirusDetectedError(f"Virus detected in ZIP entry '{relative_filename}': {scan_result.threat_name}")


async def _upload_entry(service: FileService, content: bytes, file_path: str, mime_type: str) -> None:
    """Compute the sha256 of the content and upload it to the clean bucket."""
    sha256 = await service.storage_provider_service.compute_sha256(
        source=BytesIO(content),
    )
    await service.storage_provider_service.upload_document_from_obj(
        document_name=file_path,
        file_obj=BytesIO(content),
        overwrite=True,
        mime_type=mime_type,
        metadata={"sha256": sha256},
    )


async def _process_entry(
    *,
    service: FileService,
    fs,
    source_s3_path: str,
    entry: zipfile.ZipInfo,
    activity_input: ExtractZipInput,
    project_id: UUID,
    relative_filename: str,
) -> SingleFileResult:
    """Process a single ZIP entry: validate, scan, upload and build a result.

    Raises:
        VirusScanUnavailableError: re-raised so Temporal retries the whole activity.
    """
    # Validate filename for EWMS_ZIP files
    if activity_input.file_type == "ewms_zip" and not _validate_ewms_filename(relative_filename):
        return _invalid_filename_result(relative_filename)

    entry_content = b""
    try:
        entry_content = await _read_zip_entry(fs, source_s3_path, entry)
        mime_type = validate_file_upload(
            filename=relative_filename,
            allowed_extensions=settings.ZIP_ENTRY_ALLOWED_FILE_EXTENSIONS,
            allowed_mime_types=settings.ZIP_ENTRY_ALLOWED_FILE_TYPES,
            content_bytes=entry_content,
        )

        await _scan_for_viruses(entry_content, relative_filename)

        file_path = f"tmp/{project_id}/{activity_input.zip_file_id}/{relative_filename}"
        await _upload_entry(service, entry_content, file_path, mime_type)

        return SingleFileResult(
            success=True,
            filename=relative_filename,
            bucket_path=file_path,
            action=ActionEnum.UNZIP,
        )
    except FileVirusDetectedError as exc:
        return SingleFileResult(
            success=False,
            filename=relative_filename,
            error_code=ErrorCode.VIRUS_DETECTED,
            error_message=str(exc),
            action=ActionEnum.UNZIP,
        )
    except VirusScanUnavailableError:
        # Scanner down — re-raise so Temporal retries the whole activity
        raise
    except (
        FileInvalidFileExtensionError,
        FileInvalidFileTypeError,
    ) as exc:
        activity.logger.warning(f"ZIP entry validation failed for '{relative_filename}': {exc}")
        return SingleFileResult(
            success=False,
            filename=relative_filename,
            error_code=ErrorCode.UNSUPPORTED_FILETYPE,
            error_message=str(exc),
            action=ActionEnum.UNZIP,
        )
    finally:
        # Explicitly clear entry_content for GC
        entry_content = b""


@activity.defn
async def extract_zip(
    activity_input: ExtractZipInput,
) -> list[SingleFileResult]:
    """Extract a ZIP from S3 via s3fs + zipfile and ingest each valid entry.

    Reads the ZIP from quarantine when ClamAV is enabled, otherwise from the
    clean bucket, then uploads clean entries to the clean bucket.
    Processes entries one-by-one to keep memory usage bounded to a single file.
    """
    activity.logger.info(
        f"Processing zip '{activity_input.filename}' "
        f"(zip_id={activity_input.zip_file_id}, project={activity_input.project_id})"
    )

    project_id = UUID(activity_input.project_id)
    ctx = get_s3_context(activity_input.zip_path)

    fs = ctx.fs
    source_s3_path = ctx.path

    results: list[SingleFileResult] = []

    try:
        valid_entries = await _read_zip_metadata(fs, source_s3_path, activity_input.filename)

        async with AsyncSessionLocal() as db:
            service: FileService = await create_file_service(db=db)

            for entry in valid_entries:
                relative_filename = normalize_zip_entry_name(entry)
                if not relative_filename:
                    continue

                results.append(
                    await _process_entry(
                        service=service,
                        fs=fs,
                        source_s3_path=source_s3_path,
                        entry=entry,
                        activity_input=activity_input,
                        project_id=project_id,
                        relative_filename=relative_filename,
                    )
                )

        await _delete_source_zip(fs, source_s3_path)

    except FileNotFoundError:
        return [
            SingleFileResult(
                success=False,
                filename=activity_input.filename,
                bucket_path=activity_input.zip_path,
                error_code=ErrorCode.ZIP_NOT_FOUND,
                error_message="Zip file not found in storage",
                action=ActionEnum.UNZIP,
            )
        ]
    except (zipfile.BadZipFile, ValueError) as exc:
        return [
            SingleFileResult(
                success=False,
                filename=activity_input.filename,
                error_code=ErrorCode.ZIP_INVALID,
                error_message=str(exc),
                action=ActionEnum.UNZIP,
            )
        ]

    succeeded = len([r for r in results if r.success])
    failed = len(results) - succeeded
    activity.logger.info(f"Zip processing complete: {succeeded} succeeded, {failed} failed")
    return results
