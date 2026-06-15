from http import HTTPStatus
from pathlib import Path

import httpx
from event_logging.enums import EventAction, EventCategory, EventOutcome
from temporalio import activity

from src.config.settings import settings
from src.models.schemas.files import FileObject, FileUploadArgs
from src.models.schemas.temporal.diplan import UploadFileToDMSActivityArgs
from src.services.api_clients import DiPlanClient, FilesApiClient
from src.utils.logger import logger


@activity.defn
async def download_diplan_file(args: UploadFileToDMSActivityArgs) -> FileObject | None:
    env = "develop"
    for key, value in settings.diplan.secret.items():
        if args.url.startswith(value["dms_base_url"]):
            env = key

    token = (
        await FilesApiClient.post(
            settings.diplan.secret[env]["keycloak_token_url"],
            data={
                "client_id": settings.diplan.secret[env]["client_id"],
                "client_secret": settings.diplan.secret[env]["client_secret"],
                "grant_type": "client_credentials",
            },
            include_project_version=False,
        )
    ).json()["access_token"]
    file_path = f"{args.folder_name}/{args.file_name}" if args.folder_name else args.file_name

    if Path(args.file_name).suffix.lower() in settings.diplan.skipped_file_types:
        return None

    async with FilesApiClient.get_stream(
        url=args.url,
        headers={"Authorization": f"Bearer {token}"},
        verify_ssl=False,
    ) as file:
        try:
            file_object = await FilesApiClient.upload_file(
                file_data=FileUploadArgs(
                    filename=file_path,
                    project_id=args.project_id,
                    type="document",
                ),
                file_content=file,
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == HTTPStatus.CONFLICT:
                file_object = await FilesApiClient.get_file(
                    file_name=file_path,
                    project_id=args.project_id,
                )
            elif exc.response.status_code == HTTPStatus.UNSUPPORTED_MEDIA_TYPE:
                return None
            else:
                logger.error(
                    action=EventAction.UPLOAD,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.FILE,
                    message=f"Failed: HTTP {exc.response.status_code}: {exc}",
                )
                raise

    await DiPlanClient.confirm_download(file_id=args.file_id, dms_file_id=file_object.id)
    return file_object
