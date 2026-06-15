from sqlalchemy.ext.asyncio import AsyncSession

from src.config.settings import settings
from src.services.files.file_service import FileService
from src.services.storage_provider.storage_provider_s3_service import (
    AsyncS3StorageClient,
)
from src.services.zip_files.zip_file_service import ZipFileService
from src.utils.app_state import app_state


async def get_or_create_storage_provider():
    """Return shared storage provider from app state or initialize a new one."""
    storage_provider_service = app_state.storage_provider_service
    if storage_provider_service is None:
        storage_provider_service = AsyncS3StorageClient()
        await storage_provider_service.initialize()
        app_state.storage_provider_service = storage_provider_service
    return storage_provider_service


async def get_or_create_quarantine_storage_provider():
    """Return shared quarantine storage provider from app state or initialize a new one.

    Uses QUARANTINE_BUCKET_NAME with separate S3 credentials if set,
    otherwise falls back to BUCKET_NAME (same bucket, no quarantine isolation).
    """
    quarantine_provider = app_state.quarantine_storage_provider_service
    if quarantine_provider is None:
        bucket_name = settings.QUARANTINE_BUCKET_NAME or settings.BUCKET_NAME
        kwargs = {}
        if settings.QUARANTINE_S3_ACCESS_KEY_ID:
            kwargs["access_key"] = settings.QUARANTINE_S3_ACCESS_KEY_ID
            kwargs["secret_key"] = settings.QUARANTINE_S3_SECRET_ACCESS_KEY
        if settings.QUARANTINE_S3_ENDPOINT_URL:
            kwargs["endpoint_url"] = settings.QUARANTINE_S3_ENDPOINT_URL
            kwargs["public_endpoint"] = settings.QUARANTINE_S3_ENDPOINT_URL
        quarantine_provider = AsyncS3StorageClient(
            bucket_name=bucket_name,
            **kwargs,
        )
        await quarantine_provider.initialize()
        app_state.quarantine_storage_provider_service = quarantine_provider
    return quarantine_provider


async def create_file_service(db: AsyncSession) -> FileService:
    """Build FileService with shared storage provider and given DB session."""
    storage_provider_service = await get_or_create_storage_provider()
    quarantine_storage_provider_service = await get_or_create_quarantine_storage_provider()
    return FileService(
        db=db,
        storage_provider_service=storage_provider_service,
        quarantine_storage_provider_service=quarantine_storage_provider_service,
    )


async def create_zip_file_service(db: AsyncSession) -> ZipFileService:
    """Build FileService with shared storage provider and given DB session."""
    storage_provider_service = await get_or_create_storage_provider()
    return ZipFileService(
        db=db,
        storage_provider_service=storage_provider_service,
    )
