"""
Script searches for orphaned DB entries and deletes them.
A DB entry is orphaned when its S3 object is missing.

Script supports DRY_RUN.
"""

import asyncio
import logging
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio.session import AsyncSession

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

MAX_CONCURRENT_CHECKS = 50
DRY_RUN = True
DB_COMMIT_BATCH_SIZE = 100
FILE_BATCH_SIZE = 1000


async def s3_exists(
    fid: UUID,
    path: str,
    storage_provider_service: BaseStorageProviderService,
) -> tuple[UUID, bool, str]:
    """
    Checks if a document is existing in the document store.

    Args:
        fid (UUID): File UUID to check
        path (str): The object path of the file to check
        storage_provider_service (BaseStorageProviderService): Initialized document
            store

    Returns:
        tuple[UUID, bool, str]: Tuple of File ID, whether it exists or not, File path
    """
    try:
        exists = await storage_provider_service.document_exists(path)
        return fid, exists, path
    except Exception as e:
        logger.error(f"Check failed {fid} ({path}): {e}")
        return fid, False, path


async def _apply_db_deletes(
    to_delete: list[UUID],
    session: AsyncSession,
) -> None:
    """
    Deletes File DB entries with batching.

    Args:
        to_delete (list[UUID]): List of file UUIDs to delete
        session (AsyncSession): DB session object

    Returns:
        None
    """
    for k in range(0, len(to_delete), DB_COMMIT_BATCH_SIZE):
        batch = to_delete[k : k + DB_COMMIT_BATCH_SIZE]
        await session.execute(delete(File).where(File.id.in_(batch)))
        await session.commit()
        logger.info(f"Committed update batch of {len(batch)}")


async def cleanup_orphaned_file_db_records() -> None:
    """
    Function cleans up the orphaned DB records.

    Returns:
        None
    """
    storage_provider_service = AsyncS3StorageClient()

    async with AsyncSessionLocal(expire_on_commit=False) as session:
        session.begin()
        try:
            result = await session.execute(select(File).order_by(File.id))
            all_files = result.scalars().all()

            total = len(all_files)
            logger.info(f"Scanning {total} DB records")

            if total == 0:
                return

            # Prepare list of file IDs and bucket_paths
            file_info = [(f.id, f.bucket_path) for f in all_files if f.bucket_path]

            skipped_count = total - len(file_info)
            logger.info(f"Skipping {skipped_count} files with no bucket_path")

            kept_count = failed_count = deleted_count = 0
            for i in range(0, len(file_info), FILE_BATCH_SIZE):
                file_batch = file_info[i : i + FILE_BATCH_SIZE]
                files_to_delete: list[UUID] = []

                semaphore = asyncio.Semaphore(MAX_CONCURRENT_CHECKS)

                async def sem_check(fid: UUID, path: str):
                    async with semaphore:  # noqa: B023
                        return await s3_exists(
                            fid=fid,
                            path=path,
                            storage_provider_service=storage_provider_service,
                        )

                results = await asyncio.gather(
                    *(sem_check(fid, path) for fid, path in file_batch),
                    return_exceptions=True,
                )

                for res in results:
                    if isinstance(res, Exception):
                        failed_count += 1
                        continue

                    fid, exists, path = res  # type: ignore
                    if exists:
                        kept_count += 1
                    else:
                        logger.info(f"Object MISSING → will delete {fid} ({path})")
                        files_to_delete.append(fid)
                        deleted_count += 1

                # Batch delete
                if not DRY_RUN and files_to_delete:
                    await _apply_db_deletes(to_delete=files_to_delete, session=session)
                elif DRY_RUN:
                    logger.info(f"[DRY RUN] Would delete {deleted_count} records")

            logger.info(
                f"Summary:\n"
                f"  Total checked   : {total}\n"
                f"  Kept            : {kept_count}\n"
                f"  Deleted         : {deleted_count}\n"
                f"  Skipped         : {skipped_count}\n"
                f"  Failed          : {failed_count}\n"
                f"  Concurrency     : {MAX_CONCURRENT_CHECKS}\n"
                f"  Mode            : {'DRY RUN' if DRY_RUN else 'LIVE'}"
            )
        except Exception:
            logger.error("Critical error during cleanup", exc_info=True)
            await session.rollback()
            raise

        finally:
            if session.in_transaction():
                await session.rollback()
            await session.close()
            await storage_provider_service.close()


if __name__ == "__main__":
    asyncio.run(cleanup_orphaned_file_db_records())
