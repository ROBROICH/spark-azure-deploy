"""
Script searches for orphaned object store (S3) entries and deletes them.
A DB entry is orphaned when its S3 object is missing.

Script supports DRY_RUN.
"""

import asyncio
import logging

from sqlalchemy import select

from src.models.db.database import AsyncSessionLocal
from src.models.db.db_models import File
from src.services.storage_provider.storage_provider_base_service import (
    BaseStorageProviderService,
)
from src.services.storage_provider.storage_provider_s3_service import (
    AsyncS3StorageClient,
)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

DB_COMMIT_BATCH_SIZE = 300
DRY_RUN = True


async def list_objects(
    storage_provider_service: BaseStorageProviderService,
) -> set[str]:
    """
    Fetch ALL existing paths from storage.

    Args:
        storage_provider_service (BaseStorageProviderService): The initialized object
            store
    """
    existing_paths = await storage_provider_service.list_all_documents(path=True)
    logger.info(f"Finished listing storage. Found {len(existing_paths):,} objects.")
    return set(existing_paths)


async def delete_orphaned_s3_records(
    missing_in_db: list[str],
    storage_provider_service: BaseStorageProviderService,
) -> None:
    """
    Delete orphaned S3 records.

    Args:
        missing_in_db (list[str]): List of objects not present in the database
        storage_provider_service (BaseStorageProviderService): The initialized object
            store

    Returns:
        None
    """
    for path in missing_in_db:
        await storage_provider_service.delete_document(path)
        logger.info(f"Deleted {path}")


async def cleanup_orphaned_s3_records() -> None:
    """
    Delete orphaned S3 records.

    Returns:
        None
    """
    storage_provider_service: BaseStorageProviderService = AsyncS3StorageClient()
    await storage_provider_service.initialize()

    async with AsyncSessionLocal() as session:
        try:
            existing_paths = await list_objects(storage_provider_service=storage_provider_service)

            # Get ALL DB records
            result = await session.execute(select(File.id, File.bucket_path).where(File.bucket_path.is_not(None)))
            db_records = result.all()
            path_to_id = {record.bucket_path: record.id for record in db_records}

            logger.info(f"DB contains {len(db_records):,} files with bucket_path")

            # Find which DB records are missing in storage
            to_delete: list[str] = []
            kept = 0

            for path in existing_paths:
                if path in path_to_id:
                    kept += 1
                else:
                    logger.info(f"S3 object is orphaned → will delete {path}")
                    to_delete.append(path)

            # Apply deletes in batches
            logger.info(f"Would keep   : {kept:,}")
            logger.info(f"Would delete : {len(to_delete):,}")

            if DRY_RUN:
                logger.warning("DRY RUN mode — no records were actually deleted")
            elif to_delete:
                await delete_orphaned_s3_records(
                    missing_in_db=to_delete,
                    storage_provider_service=storage_provider_service,
                )
                logger.info("Cleanup finished — deletes committed")

            logger.info(
                "Summary:\n"
                f"  S3 records scanned      : {len(existing_paths):,}\n"
                f"  Kept (found in DB)      : {kept:,}\n"
                f"  Deleted (missing)       : {len(to_delete):,}\n"
                f"  Mode                    : {'DRY RUN' if DRY_RUN else 'LIVE'}"
            )

        except Exception:
            logger.exception("Critical error during DB cleanup")
            await session.rollback()
            raise
        finally:
            if session.in_transaction():
                await session.rollback()
            await session.close()
            await storage_provider_service.close()


if __name__ == "__main__":
    asyncio.run(cleanup_orphaned_s3_records())
