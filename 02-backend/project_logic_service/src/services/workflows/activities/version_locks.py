from uuid import UUID, uuid4

from sqlalchemy import select, update
from temporalio import activity

from src.models.db.database import AsyncSessionLocal, _init_engine
from src.models.db.workflow_enum import ProjectVersionLockStatus
from src.models.db_models import ProjectVersionLock


@activity.defn
async def acquire_project_version_lock(
    project_id: UUID,
    source_version: int,
    target_version: int,
    zip_file_id: UUID | None = None,
) -> str:
    _init_engine()
    token = uuid4().hex
    async with AsyncSessionLocal() as session:
        existing = await session.execute(
            select(ProjectVersionLock)
            .where(
                ProjectVersionLock.project_id == project_id,
                ProjectVersionLock.status == ProjectVersionLockStatus.ACTIVE,
            )
            .limit(1)
        )
        if existing.scalar_one_or_none() is not None:
            raise RuntimeError(f"Project {project_id} already has an active version lock")

        session.add(
            ProjectVersionLock(
                project_id=project_id,
                source_version=source_version,
                target_version=target_version,
                zip_file_id=zip_file_id,
                lock_token=token,
                status=ProjectVersionLockStatus.ACTIVE,
            )
        )
        await session.commit()
    return token


@activity.defn
async def release_project_version_lock(
    project_id: UUID,
    lock_token: str,
    error: str | None = None,
) -> None:
    _init_engine()
    async with AsyncSessionLocal() as session:
        await session.execute(
            update(ProjectVersionLock)
            .where(
                ProjectVersionLock.project_id == project_id,
                ProjectVersionLock.lock_token == lock_token,
                ProjectVersionLock.status == ProjectVersionLockStatus.ACTIVE,
            )
            .values(
                status=ProjectVersionLockStatus.RELEASED,
                error=error,
            )
        )
        await session.commit()
