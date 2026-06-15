from datetime import UTC, datetime
from uuid import uuid4

import pytest
from node_crud.exceptions import ProjectVersionLockedError
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import (
    TopicAlreadyExistsError,
    TopicNotFoundError,
)
from src.models.db.workflow_enum import ProjectVersionLockStatus
from src.models.db_models import Project, ProjectVersionLock, Topic
from src.models.schemas.topic_schemas import CreateTopicRequest, UpdateTopicRequest
from src.services.topics.topic_service import TopicService

LATEST_PROJECT_VERSION = 2
EXPECTED_BULK_TOPIC_COUNT = 5


@pytest.fixture
async def topic_service(db_session: AsyncSession) -> TopicService:
    return TopicService(db=db_session)


@pytest.fixture
async def topic_a(db_session: AsyncSession, create_test_project: Project) -> Topic:
    topic = Topic(
        project_id=create_test_project.id,
        name="Topic Alpha",
        description="First topic",
    )
    db_session.add(topic)
    await db_session.commit()
    await db_session.refresh(topic)
    return topic


@pytest.fixture
async def topic_b(db_session: AsyncSession, create_test_project: Project) -> Topic:
    topic = Topic(
        project_id=create_test_project.id,
        name="Topic Beta",
        description="Second topic",
    )
    db_session.add(topic)
    await db_session.commit()
    await db_session.refresh(topic)
    return topic


@pytest.fixture
async def many_topics(db_session: AsyncSession, create_test_project: Project) -> list[Topic]:
    topics = []
    for i in range(10):
        topic = Topic(
            project_id=create_test_project.id,
            name=f"Bulk Topic {i + 1:02d}",
            description=f"Description for bulk topic {i + 1}",
        )
        db_session.add(topic)
        topics.append(topic)

    await db_session.commit()
    for topic in topics:
        await db_session.refresh(topic)

    return topics


@pytest.mark.asyncio
async def test_create_topic_success(
    topic_service: TopicService,
    create_test_project: Project,
):
    req = CreateTopicRequest(
        project_id=create_test_project.id,
        name="Security",
        description="Data protection",
        show_in_mvp=False,
        show_in_ewm=True,
        show_in_beschluss=False,
    )
    created = await topic_service.create_topic(data=req)

    assert created.project_id == create_test_project.id
    assert created.name == "Security"
    assert created.description == "Data protection"
    assert created.show_in_mvp is False
    assert created.show_in_ewm is True
    assert created.show_in_beschluss is False
    assert created.is_deleted is False


@pytest.mark.asyncio
async def test_create_topic_duplicate_name_raises(
    topic_service: TopicService,
    create_test_project: Project,
):
    req = CreateTopicRequest(
        project_id=create_test_project.id,
        name="Duplicate",
        description=None,
    )

    await topic_service.create_topic(data=req)

    with pytest.raises(TopicAlreadyExistsError):
        await topic_service.create_topic(data=req)


@pytest.mark.asyncio
async def test_get_topic_success(
    topic_service: TopicService,
    topic_a: Topic,
):
    fetched = await topic_service.get_topic(topic_a.id)
    assert fetched.id == topic_a.id
    assert fetched.name == "Topic Alpha"


@pytest.mark.asyncio
async def test_get_topic_returns_latest_project_version(
    topic_service: TopicService,
    create_test_project: Project,
    db_session: AsyncSession,
):
    topic_id = uuid4()
    project_v2 = Project(
        id=create_test_project.id,
        project_version=2,
        name=create_test_project.name,
        project_type_id=create_test_project.project_type_id,
        status_id=create_test_project.status_id,
        created_by_id=create_test_project.created_by_id,
        entry_date=create_test_project.entry_date,
        internal_project_number=create_test_project.internal_project_number,
        current_process_step_id=create_test_project.current_process_step_id,
        original_created_at=create_test_project.original_created_at,
    )
    db_session.add_all(
        [
            project_v2,
            Topic(
                id=topic_id,
                project_id=create_test_project.id,
                project_version=1,
                name="Topic v1",
            ),
            Topic(
                id=topic_id,
                project_id=create_test_project.id,
                project_version=2,
                name="Topic v2",
            ),
        ]
    )
    await db_session.commit()

    fetched = await topic_service.get_topic(topic_id)

    assert fetched.project_version == LATEST_PROJECT_VERSION
    assert fetched.name == "Topic v2"


@pytest.mark.asyncio
async def test_get_topic_not_found_raises(
    topic_service: TopicService,
):
    with pytest.raises(TopicNotFoundError):
        await topic_service.get_topic(uuid4())


@pytest.mark.asyncio
async def test_list_topics_filter_by_project(
    topic_service: TopicService,
    create_test_project: Project,
    db_session: AsyncSession,
):
    other_project = Project(
        id=uuid4(),
        name="Other Project",
        project_type_id=create_test_project.project_type_id,
        status_id=create_test_project.status_id,
        created_by_id=uuid4(),
        entry_date=create_test_project.entry_date,
        internal_project_number="OTHER-123",
        current_process_step_id=create_test_project.current_process_step_id,
        original_created_at=datetime.now(UTC),
    )
    db_session.add(other_project)
    await db_session.flush()

    project_topic = Topic(
        project_id=create_test_project.id,
        name="Owned Topic",
        description=None,
    )
    other_topic = Topic(
        project_id=other_project.id,
        name="Other Topic",
        description=None,
    )
    db_session.add_all([project_topic, other_topic])
    await db_session.commit()

    items = await topic_service.list_topics(project_id=create_test_project.id)

    assert len(items) == 1
    assert items[0].name == "Owned Topic"


@pytest.mark.asyncio
async def test_list_topics_filters_to_latest_project_version(
    topic_service: TopicService,
    create_test_project: Project,
    db_session: AsyncSession,
):
    topic_id = uuid4()
    project_v2 = Project(
        id=create_test_project.id,
        project_version=2,
        name=create_test_project.name,
        project_type_id=create_test_project.project_type_id,
        status_id=create_test_project.status_id,
        created_by_id=create_test_project.created_by_id,
        entry_date=create_test_project.entry_date,
        internal_project_number=create_test_project.internal_project_number,
        current_process_step_id=create_test_project.current_process_step_id,
        original_created_at=create_test_project.original_created_at,
    )
    db_session.add_all(
        [
            project_v2,
            Topic(
                id=topic_id,
                project_id=create_test_project.id,
                project_version=1,
                name="Historical Topic",
            ),
            Topic(
                id=topic_id,
                project_id=create_test_project.id,
                project_version=2,
                name="Latest Topic",
            ),
        ]
    )
    await db_session.commit()

    items = await topic_service.list_topics(project_id=create_test_project.id)

    assert [topic.name for topic in items] == ["Latest Topic"]


@pytest.mark.asyncio
async def test_update_topic_success(
    topic_service: TopicService,
    topic_a: Topic,
):
    update = UpdateTopicRequest(
        description="Updated desc",
        name="Topic Alpha++",
        show_in_ewm=False,
        show_in_beschluss=False,
    )

    updated = await topic_service.update_topic(topic_a.id, update)

    assert updated.description == "Updated desc"
    assert updated.name == "Topic Alpha++"
    assert updated.show_in_ewm is False
    assert updated.show_in_beschluss is False


@pytest.mark.asyncio
async def test_create_topic_rejects_active_version_lock(
    topic_service: TopicService,
    create_test_project: Project,
    db_session: AsyncSession,
):
    db_session.add(
        ProjectVersionLock(
            project_id=create_test_project.id,
            source_version=1,
            target_version=2,
            lock_token="token",
            status=ProjectVersionLockStatus.ACTIVE,
        )
    )
    await db_session.commit()

    with pytest.raises(ProjectVersionLockedError):
        await topic_service.create_topic(
            CreateTopicRequest(
                project_id=create_test_project.id,
                name="Locked Topic",
            )
        )


@pytest.mark.asyncio
async def test_delete_topic_soft_delete(
    topic_service: TopicService,
    topic_a: Topic,
):
    deleted = await topic_service.delete_topic(topic_a.id)

    assert deleted.is_deleted is True

    items = await topic_service.list_topics(project_id=topic_a.project_id)
    assert deleted.id not in {topic.id for topic in items}


async def test_bulk_get_all_exist(
    topic_service: TopicService,
    many_topics: list[Topic],
):
    ids = [topic.id for topic in many_topics[:5]]

    result = await topic_service.get_topics(topic_ids=ids, include_deleted=False, raise_on_missing=False)

    assert len(result) == EXPECTED_BULK_TOPIC_COUNT
    assert {topic.id for topic in result} == set(ids)
    assert [topic.id for topic in result] == ids


async def test_bulk_get_some_missing_raise_mode(
    topic_service: TopicService,
    many_topics: list[Topic],
):
    existing_ids = [topic.id for topic in many_topics[:2]]
    fake_id = uuid4()

    with pytest.raises(TopicNotFoundError) as exc_info:
        await topic_service.get_topics(topic_ids=[*existing_ids, fake_id], raise_on_missing=True)

    assert "not found" in str(exc_info.value).lower()
    assert str(fake_id) in str(exc_info.value)
