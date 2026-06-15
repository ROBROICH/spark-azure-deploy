from dataclasses import dataclass

import s3fs

from src.config.settings import settings


@dataclass
class S3Context:
    fs: s3fs.S3FileSystem
    path: str


def get_s3_context(object_path: str) -> S3Context:
    if settings.CLAMAV.ENABLED:
        return S3Context(
            fs=_create_quarantine_bucket_s3fs(),
            path=_get_quarantine_bucket_s3_path(object_path),
        )

    return S3Context(
        fs=_create_clean_bucket_s3fs(),
        path=_get_clean_bucket_s3_path(object_path),
    )


def _create_clean_bucket_s3fs() -> s3fs.S3FileSystem:
    """Create an S3FileSystem configured for the clean bucket."""
    return s3fs.S3FileSystem(
        endpoint_url=settings.S3_ENDPOINT_URL,
        key=settings.S3_ACCESS_KEY_ID,
        secret=settings.S3_SECRET_ACCESS_KEY,
        client_kwargs=({"region_name": settings.S3_REGION} if settings.S3_REGION else {}),
        default_cache_type="none",
    )


def _create_quarantine_bucket_s3fs() -> s3fs.S3FileSystem:
    """Create an S3FileSystem configured for the quarantine bucket."""
    return s3fs.S3FileSystem(
        endpoint_url=settings.QUARANTINE_S3_ENDPOINT_URL,
        key=settings.QUARANTINE_S3_ACCESS_KEY_ID,
        secret=settings.QUARANTINE_S3_SECRET_ACCESS_KEY,
        client_kwargs=({"region_name": settings.S3_REGION} if settings.S3_REGION else {}),
        default_cache_type="none",
    )


def _get_clean_bucket_s3_path(object_path: str) -> str:
    """Build the full S3 object path in the clean bucket."""
    return f"{settings.BUCKET_NAME}/{settings.DOC_STORE_PATH.rstrip('/')}/{object_path}"


def _get_quarantine_bucket_s3_path(object_path: str) -> str:
    """Build the full S3 object path in the quarantine bucket."""
    return f"{settings.QUARANTINE_BUCKET_NAME}/{settings.DOC_STORE_PATH.rstrip('/')}/{object_path}"
