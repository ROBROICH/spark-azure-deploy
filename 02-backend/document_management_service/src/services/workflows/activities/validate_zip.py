import asyncio
import zipfile

from temporalio import activity
from temporalio.exceptions import ApplicationError

from src.models.db.workflow_enum import ErrorCode
from src.services.workflows.activities.activity_models import (
    ValidateZipInput,
    ValidateZipOutput,
)
from src.services.workflows.activities.activity_utils import (
    get_s3_context,
)
from src.services.zip_utils import validate_zip_metadata


@activity.defn
async def validate_zip(activity_input: ValidateZipInput) -> ValidateZipOutput:
    """Validate ZIP metadata via s3fs (reads only the Central Directory)."""
    activity.logger.info(f"Validating zip metadata for '{activity_input.filename}'")

    ctx = get_s3_context(activity_input.zip_path)

    fs = ctx.fs
    s3_path = ctx.path

    def _validate_sync() -> ValidateZipOutput:
        with fs.open(s3_path, "rb") as f, zipfile.ZipFile(f) as zf:
            valid_entries = validate_zip_metadata(zf, activity_input.filename)
            total_size = sum(e.file_size for e in valid_entries)
            return ValidateZipOutput(
                entry_count=len(valid_entries),
                total_uncompressed_size=total_size,
            )

    try:
        return await asyncio.to_thread(_validate_sync)
    except (zipfile.BadZipFile, ValueError, UnicodeDecodeError) as exc:
        raise ApplicationError(
            str(exc),
            type=ErrorCode.ZIP_INVALID,
            non_retryable=True,
        ) from exc
