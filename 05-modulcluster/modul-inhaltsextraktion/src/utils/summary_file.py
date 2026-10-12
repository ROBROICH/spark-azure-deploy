from collections.abc import Sequence
from uuid import UUID

import httpx
from temporal.contracts import SummaryData
from temporalio import activity

from src.utils.dms_utils import (
    DmsUploadInput,
    FileObject,
    delete_file,
    list_all_files,
    upload_file,
)

SUMMARY_FILENAME = "summary.json"
SUMMARY_FILE_TYPE = "content_extraction"


async def list_summary_files(project_id: UUID) -> list[FileObject]:
    files = await list_all_files(project_id, SUMMARY_FILE_TYPE)
    summary_files = [file_obj for file_obj in files if file_obj.filename == SUMMARY_FILENAME]
    return sorted(summary_files, key=lambda file_obj: file_obj.created_at, reverse=True)


def serialize_summary(summary: SummaryData) -> bytes:
    return summary.model_dump_json(
        indent=2,
        by_alias=True,
        exclude={"processed_files": {"__all__": {"processed_document"}}},
    ).encode("utf-8")


async def replace_summary_file(
    project_id: UUID,
    summary_bytes: bytes,
    previous_files: Sequence[FileObject],
) -> FileObject:
    new_file = await upload_file(
        DmsUploadInput(
            data=summary_bytes,
            filename=SUMMARY_FILENAME,
            project_id=project_id,
            file_type=SUMMARY_FILE_TYPE,
            content_type="application/json",
        )
    )

    for old_file in previous_files:
        if old_file.id == new_file.id:
            continue
        try:
            await delete_file(old_file.id)
        except httpx.HTTPError:
            activity.logger.exception(
                "Uploaded new summary.json for project %s but failed to delete old summary.json %s",
                project_id,
                old_file.id,
            )
            continue
        activity.logger.info("Deleted old summary.json: %s", old_file.id)

    return new_file
