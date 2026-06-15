from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import not_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import (
    ProjectNotFoundError,
    TopicAlreadyExistsError,
    TopicNotFoundError,
)
from src.models.db_models import Topic, TopicNorm
from src.models.schemas.topic_schemas import CreateTopicRequest, UpdateTopicRequest
from src.services.projects import project_service

MAX_PAGE_SIZE = 1000


class TopicService:
    """Service class for managing project-owned topics."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _validate_parent_topic(
        self,
        *,
        project_id: UUID,
        project_version: int,
        parent_topic_id: UUID | None,
    ) -> None:
        if parent_topic_id is None:
            return

        result = await self.db.execute(
            select(Topic.id).where(
                Topic.id == parent_topic_id,
                Topic.project_id == project_id,
                Topic.project_version == project_version,
                not_(Topic.is_deleted),
            )
        )
        if result.scalar_one_or_none() is None:
            raise TopicNotFoundError(str(parent_topic_id))

    async def _ensure_unique_topic_name(
        self,
        *,
        project_id: UUID,
        project_version: int,
        name: str,
        parent_topic_id: UUID | None,
        exclude_topic_id: UUID | None = None,
    ) -> None:
        stmt = select(Topic.id).where(
            Topic.project_id == project_id,
            Topic.project_version == project_version,
            Topic.name == name,
            Topic.parent_topic_id == parent_topic_id,
            not_(Topic.is_deleted),
        )
        if exclude_topic_id is not None:
            stmt = stmt.where(Topic.id != exclude_topic_id)

        existing = await self.db.execute(stmt)
        if existing.scalar_one_or_none() is not None:
            raise TopicAlreadyExistsError(f"Topic with name '{name}' already exists")

    async def create_topic(
        self,
        data: CreateTopicRequest,
    ) -> Topic:
        project = await project_service.get_project_orm(db=self.db, project_id=data.project_id)
        if project is None:
            raise ProjectNotFoundError(str(data.project_id))
        project_version = await project_service.ensure_project_write_version(
            db=self.db,
            project_id=data.project_id,
            project_version=project.project_version,
        )
        await self._validate_parent_topic(
            project_id=data.project_id,
            project_version=project_version,
            parent_topic_id=data.parent_topic_id,
        )
        await self._ensure_unique_topic_name(
            project_id=data.project_id,
            project_version=project_version,
            name=data.name,
            parent_topic_id=data.parent_topic_id,
        )

        topic = Topic(
            project_id=data.project_id,
            project_version=project_version,
            name=data.name,
            description=data.description,
            parent_topic_id=data.parent_topic_id,
            show_in_mvp=data.show_in_mvp,
            show_in_ewm=data.show_in_ewm,
            show_in_beschluss=data.show_in_beschluss,
        )

        self.db.add(topic)
        await self.db.commit()
        await self.db.refresh(topic)
        return topic

    async def get_topic(
        self,
        topic_id: UUID,
        include_deleted: bool = False,
    ) -> Topic:
        latest_projects = project_service._latest_project_versions_subquery()
        stmt = (
            select(Topic)
            .join(
                latest_projects,
                (Topic.project_id == latest_projects.c.project_id)
                & (Topic.project_version == latest_projects.c.project_version),
            )
            .where(Topic.id == topic_id)
        )
        if not include_deleted:
            stmt = stmt.where(not_(Topic.is_deleted))

        result = await self.db.execute(stmt)
        topic = result.scalars().first()

        if not topic:
            raise TopicNotFoundError(str(topic_id))

        return topic

    async def list_topics(
        self,
        project_id: UUID | None = None,
        include_deleted: bool = False,
        page: int = 1,
        page_size: int = 50,
        assigned_project_ids: list[UUID] | None = None,
    ) -> Sequence[Topic]:
        offset = max(0, page - 1) * page_size
        limit = max(1, min(page_size, MAX_PAGE_SIZE))

        latest_projects = project_service._latest_project_versions_subquery()
        stmt = (
            select(Topic)
            .join(
                latest_projects,
                (Topic.project_id == latest_projects.c.project_id)
                & (Topic.project_version == latest_projects.c.project_version),
            )
            .order_by(Topic.name.asc())
            .offset(offset)
            .limit(limit)
        )

        if not include_deleted:
            stmt = stmt.where(not_(Topic.is_deleted))

        if project_id is not None:
            stmt = stmt.where(Topic.project_id == project_id)
        elif assigned_project_ids is not None:
            stmt = stmt.where(Topic.project_id.in_(assigned_project_ids))

        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def update_topic(
        self,
        topic_id: UUID,
        data: UpdateTopicRequest,
    ) -> Topic:
        topic = await self.get_topic(
            topic_id=topic_id,
            include_deleted=True,
        )
        await project_service.ensure_project_write_version(
            db=self.db,
            project_id=topic.project_id,
            project_version=topic.project_version,
        )

        update_data = data.model_dump(exclude_unset=True)
        new_parent_topic_id = update_data.get("parent_topic_id", topic.parent_topic_id)
        new_name = update_data.get("name", topic.name)

        await self._validate_parent_topic(
            project_id=topic.project_id,
            project_version=topic.project_version,
            parent_topic_id=new_parent_topic_id,
        )
        await self._ensure_unique_topic_name(
            project_id=topic.project_id,
            project_version=topic.project_version,
            name=new_name,
            parent_topic_id=new_parent_topic_id,
            exclude_topic_id=topic.id,
        )

        for key, value in update_data.items():
            setattr(topic, key, value)

        await self.db.commit()
        await self.db.refresh(topic)
        return topic

    async def delete_topic(self, topic_id: UUID) -> Topic:
        topic = await self.get_topic(
            topic_id=topic_id,
            include_deleted=True,
        )
        await project_service.ensure_project_write_version(
            db=self.db,
            project_id=topic.project_id,
            project_version=topic.project_version,
        )
        topic.is_deleted = True

        await self.db.commit()
        await self.db.refresh(topic)
        return topic

    async def get_topics(
        self,
        topic_ids: list[UUID],
        include_deleted: bool = False,
        raise_on_missing: bool = False,
    ) -> list[Topic]:
        if not topic_ids:
            return []

        unique_ids: list[UUID] = list(dict.fromkeys(topic_ids))

        latest_projects = project_service._latest_project_versions_subquery()
        stmt = (
            select(Topic)
            .join(
                latest_projects,
                (Topic.project_id == latest_projects.c.project_id)
                & (Topic.project_version == latest_projects.c.project_version),
            )
            .where(Topic.id.in_(unique_ids))
        )
        if not include_deleted:
            stmt = stmt.where(not_(Topic.is_deleted))

        result = await self.db.execute(stmt)
        found_topics = result.scalars().all()

        found_ids = {topic.id for topic in found_topics}
        if raise_on_missing:
            missing = set(unique_ids) - found_ids
            if missing:
                raise TopicNotFoundError(f"Topics not found: {', '.join(str(missing_id) for missing_id in missing)}")

        topic_map = {topic.id: topic for topic in found_topics}
        return [topic_map[topic_id] for topic_id in unique_ids if topic_id in topic_map]

    async def get_norms_from_topic(self, topic_id: UUID, include_deleted: bool = False) -> Sequence[TopicNorm]:
        topic = await self.get_topic(topic_id=topic_id, include_deleted=include_deleted)
        stmt = select(TopicNorm).where(
            TopicNorm.topic_id == topic.id,
            TopicNorm.project_version == topic.project_version,
        )

        if not include_deleted:
            stmt = stmt.where(TopicNorm.is_deleted.is_(False))

        result = await self.db.execute(stmt)
        return result.scalars().all()
