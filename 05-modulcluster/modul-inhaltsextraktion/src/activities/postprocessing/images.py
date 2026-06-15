"""Image upload activities for DMS."""

import asyncio
import mimetypes
from datetime import timedelta
from uuid import UUID

from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.activities.postprocessing.schemas import UploadImagesToDmsInput
from src.config import get_config
from src.utils.dms_utils import DmsUploadInput, FileObject
from src.utils.dms_utils import upload_file_overwrite as upload_file
from src.utils.path_utils import get_output_dir

__all__ = [
    "_upload_image_to_dms",
    "_upload_images_to_dms",
    "upload_images_to_dms",
]


async def _upload_image_to_dms(
    img_filename: str,
    img_bytes: bytes,
    *,
    semaphore: asyncio.Semaphore,
    upload_folder: str,
    project_id: UUID,
    suppress_errors: bool = True,
) -> FileObject | None:
    """Upload a single image to DMS with semaphore-gated concurrency.

    Returns FileObject on success.  When *suppress_errors* is True (default),
    failures are logged as warnings and None is returned.  When False,
    exceptions propagate to the caller unchanged.
    """
    async with semaphore:
        img_content_type, _ = mimetypes.guess_type(img_filename)
        if not img_content_type:
            img_content_type = "image/png"

        try:
            return await upload_file(
                DmsUploadInput(
                    data=img_bytes,
                    filename=f"{upload_folder}/images/{img_filename}",
                    project_id=project_id,
                    file_type="content_extraction",
                    content_type=img_content_type,
                )
            )
        except Exception as e:
            if not suppress_errors:
                raise
            activity.logger.warning(f"Failed to upload image {img_filename}: {e}")
            return None


@activity.defn(name="upload_images_to_dms")
async def _upload_images_to_dms(input: UploadImagesToDmsInput) -> int:
    """
    Upload extracted images to DMS for frontend consumption.

    Runs as a separate activity with heartbeats so Temporal can track
    progress and detect stuck uploads. Uses a semaphore to upload
    multiple images concurrently without overwhelming DMS.
    """
    upload_folder = get_output_dir(input.filename)
    uploaded = 0
    total = len(input.images)
    semaphore = asyncio.Semaphore(get_config().MAX_CONCURRENT_DMS_IMAGE_UPLOADS)

    async def _do_upload(name: str, data: bytes) -> None:
        """Upload a single image to DMS with semaphore gating."""
        nonlocal uploaded
        await _upload_image_to_dms(
            name,
            data,
            semaphore=semaphore,
            upload_folder=upload_folder,
            project_id=input.project_id,
            suppress_errors=False,
        )
        uploaded += 1
        activity.heartbeat(f"Uploaded {uploaded}/{total} images")

    await asyncio.gather(*[_do_upload(name, data) for name, data in input.images.items()])

    activity.logger.info(f"Uploaded {uploaded} images to DMS")
    return uploaded


async def upload_images_to_dms(
    images: dict[str, bytes],
    project_id: UUID,
    filename: str,
) -> int:
    """Workflow wrapper for upload_images_to_dms activity."""
    return await workflow.execute_activity(
        _upload_images_to_dms,
        UploadImagesToDmsInput(
            images=images,
            project_id=project_id,
            filename=filename,
        ),
        start_to_close_timeout=timedelta(minutes=30),
        heartbeat_timeout=timedelta(minutes=2),
        retry_policy=RetryPolicy(maximum_attempts=get_config().TEMPORAL_STORAGE_ACTIVITY_MAX_ATTEMPTS),
    )
