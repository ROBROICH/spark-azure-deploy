from http import HTTPStatus

import httpx
from event_logging.enums import EventAction, EventCategory, EventOutcome
from temporalio import activity

from src.config.settings import settings
from src.models.schemas.files import FileObject, FileUploadArgs
from src.models.schemas.temporal.fpp import UploadFPPFileToDMSActivityArgs
from src.services.api_clients import FilesApiClient, FPPClient
from src.utils.logger import logger


@activity.defn
async def download_fpp_file(args: UploadFPPFileToDMSActivityArgs) -> FileObject | None:
    """
    Download a file from FPP and upload it to DMS.

    Args:
        args: Activity arguments containing file URL, name, and metadata

    Returns:
        FileObject if successful, None if file type is skipped or unsupported
    """
    logger.info(
        action=EventAction.DOWNLOAD,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.FILE,
        message=f"Starting FPP file download: {args.file_name} (ID: {args.file_id}) for project {args.project_id}",
    )

    # Get authentication token using password grant type
    logger.info(
        action=EventAction.DOWNLOAD,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.FILE,
        message="Acquiring authentication token for FPP download",
    )

    token = (
        await FilesApiClient.post(
            settings.fpp.keycloak_token_url,
            data={
                "client_id": settings.fpp.client_id,
                "client_secret": settings.fpp.client_secret,
                "grant_type": "password",
                "username": settings.fpp.username,
                "password": settings.fpp.password,
                "scope": "openid",
            },
            include_project_version=False,
        )
    ).json()["access_token"]

    logger.info(
        action=EventAction.DOWNLOAD,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.FILE,
        message="Successfully acquired authentication token for FPP",
    )

    # Download file from FPP and upload to DMS
    logger.info(
        action=EventAction.DOWNLOAD,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.FILE,
        message=f"Starting streaming download from FPP: {args.url}",
    )

    async with FilesApiClient.get_stream(
        url=args.url,
        headers={"Authorization": f"Bearer {token}"},
        verify_ssl=True,
    ) as file:
        # Log response headers for debugging
        content_type = file.headers.get("content-type", "unknown")
        content_length = file.headers.get("content-length", "unknown")

        logger.info(
            action=EventAction.DOWNLOAD,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.FILE,
            message=f"Received response from FPP - Content-Type: {content_type}, Content-Length: {content_length}",
        )
        try:
            file_object = await FilesApiClient.upload_file(
                file_data=FileUploadArgs(
                    filename=args.file_name,
                    project_id=args.project_id,
                    type="zip",
                ),
                file_content=file,
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == HTTPStatus.CONFLICT:
                # File already exists, retrieve it
                file_object = await FilesApiClient.get_file(
                    file_name=args.file_name,
                    project_id=args.project_id,
                )
                logger.info(
                    action=EventAction.UPLOAD,
                    outcome=EventOutcome.SUCCESS,
                    category=EventCategory.FILE,
                    message=f"File {args.file_name} already exists, retrieved existing",
                )
            elif exc.response.status_code == HTTPStatus.UNSUPPORTED_MEDIA_TYPE:
                # Unsupported media type
                logger.warn(
                    action=EventAction.UPLOAD,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.FILE,
                    message=f"Unsupported file type: {args.file_name}",
                )
                return None
            else:
                logger.error(
                    action=EventAction.UPLOAD,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.FILE,
                    message=f"Failed FPP Download: {exc.response.status_code}: {exc}",
                )
                raise
        except Exception as exc:
            logger.error(
                action=EventAction.UPLOAD,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.FILE,
                message=f"Failed FPP Download: {exc}",
            )
            raise

    # Confirm download with FPP service
    await FPPClient.confirm_download(file_id=args.file_id, dms_file_id=file_object.id)

    logger.info(
        action=EventAction.UPLOAD,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.FILE,
        message=f"Successfully downloaded and uploaded FPP file {args.file_name}",
    )

    return file_object
