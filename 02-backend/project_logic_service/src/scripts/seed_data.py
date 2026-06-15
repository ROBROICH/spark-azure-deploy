"""Database seeding script for required lookup data."""

import asyncio
import uuid
from typing import Any

from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db.database import get_db_session
from src.models.db_models import (
    ProjectStatus,
    ProjectType,
)
from src.models.schemas.project_schemas import (
    ProjectInternalStatusEnum,
    ProjectStatusEnum,
)
from src.services.projects.default_topic_seed_data import DEFAULT_PROJECT_TYPE_NAME
from src.utils.logger import logger


def uid(n: int) -> uuid.UUID:
    return uuid.UUID(int=n)


async def row_exists(db: AsyncSession, model: type, **filters: Any) -> bool:
    stmt = select(model.id).filter_by(**filters).limit(1)
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is not None


async def seed_table(db: AsyncSession, model_instances: list[Any]) -> None:
    to_add = []
    for instance in model_instances:
        if not await row_exists(db=db, model=type(instance), id=instance.id):
            to_add.append(instance)

    if to_add:
        db.add_all(to_add)
        await db.flush()


async def seed_project_statuses(db: AsyncSession) -> None:
    statuses = [
        ProjectStatus(
            id=uid(0),
            name=ProjectStatusEnum.OPEN,
            internal_name=ProjectInternalStatusEnum.OPEN,
        ),
        ProjectStatus(
            id=uid(1),
            name=ProjectStatusEnum.IN_PROGRESS,
            internal_name=ProjectInternalStatusEnum.IN_PROGRESS,
        ),
        ProjectStatus(
            id=uid(2),
            name=ProjectStatusEnum.IN_CREATION,
            internal_name=ProjectInternalStatusEnum.IN_CREATION,
        ),
        ProjectStatus(
            id=uid(3),
            name=ProjectStatusEnum.COMPLETED,
            internal_name=ProjectInternalStatusEnum.COMPLETED,
        ),
        ProjectStatus(
            id=uid(4),
            name=ProjectStatusEnum.UPLOAD_DOCUMENTS,
            internal_name=ProjectInternalStatusEnum.UPLOAD_DOCUMENTS,
        ),
    ]

    await seed_table(db=db, model_instances=statuses)


async def seed_project_types(db: AsyncSession) -> None:
    project_types = [
        ProjectType(id=uid(0), name=DEFAULT_PROJECT_TYPE_NAME),
    ]

    await seed_table(db=db, model_instances=project_types)


async def seed_data(db: AsyncSession) -> None:
    logger.info(
        action=EventAction.WRITE,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.DATABASE,
        default_event=LogEventDefault.DB_WRITE,
        message="Starting database seeding...",
    )

    await seed_project_statuses(db)
    await seed_project_types(db)
    await db.commit()

    logger.info(
        action=EventAction.WRITE,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.DATABASE,
        default_event=LogEventDefault.DB_SUCCESS,
        message="Successfully seeded database",
    )


async def main() -> None:
    async for session in get_db_session():
        await seed_data(db=session)
        break


if __name__ == "__main__":
    asyncio.run(main())
