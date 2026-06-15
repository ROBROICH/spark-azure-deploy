"""Tests for project service (excluding agent triggers)."""

from datetime import UTC, date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from node_crud.exceptions import ProjectVersionLockedError, VersionNotLatestError
from sqlalchemy import select

from src.exceptions import (
    InvalidStatusError,
    InvalidStatusTransitionError,
    ProjectNotFoundError,
)
from src.models.db.topic_enum import TopicNormType
from src.models.db.workflow_enum import ProjectVersionLockStatus
from src.models.db_models import (
    Applicant,
    Project,
    ProjectStatus,
    ProjectType,
    ProjectVersionLock,
    Subtopic,
    Topic,
    TopicNorm,
)
from src.models.schemas.project_schemas import (
    CreateProjectRequest,
    GermanState,
    ProjectInternalStatusEnum,
    UpdateProjectRequest,
    UpdateProjectStatusRequest,
)
from src.services.projects import project_service
from src.services.projects.default_topic_seed_data import DEFAULT_PROJECT_TYPE_NAME
from src.services.topics.topic_service import TopicService
from src.services.workflows.activities.project_root_version import (
    _delete_project_root_version,
    copy_project_root_version,
)

EXPECTED_BNAT_SCHG_44_NORM_COUNT = 2
EXPECTED_PROJECT_VERSION = 2
EXPECTED_MEMBER_COUNT = 2


@pytest.fixture
async def setup_defaults(db_session):
    """Insert default status and type for tests."""
    default_status = ProjectStatus(
        id=uuid4(),
        name="Offen",
        internal_name=ProjectInternalStatusEnum.OPEN,
    )
    new_status = ProjectStatus(
        id=uuid4(),
        name="In Bearbeitung",
        internal_name=ProjectInternalStatusEnum.IN_PROGRESS,
    )
    in_creation_status = ProjectStatus(
        id=uuid4(),
        name="In Erstellung",
        internal_name=ProjectInternalStatusEnum.IN_CREATION,
    )
    completed_status = ProjectStatus(
        id=uuid4(),
        name="Abgeschlossen",
        internal_name=ProjectInternalStatusEnum.COMPLETED,
    )
    default_type = ProjectType(id=uuid4(), name=DEFAULT_PROJECT_TYPE_NAME)

    db_session.add_all([default_status, default_type, new_status, in_creation_status, completed_status])
    await db_session.commit()
    await db_session.refresh(default_status)
    await db_session.refresh(new_status)
    await db_session.refresh(in_creation_status)
    await db_session.refresh(completed_status)
    await db_session.refresh(default_type)
    return default_status, default_type, new_status, in_creation_status


@pytest.fixture
async def create_data(setup_defaults):
    default_status, default_type, _new_status, _in_creation_status = setup_defaults
    return CreateProjectRequest(
        name="Test Project",
        project_type_id=default_type.id,
        status_id=default_status.id,
        current_process_step_id=uuid4(),
        state=GermanState.BY,
        internal_project_number="P123",
        created_by_id=uuid4(),
        location="Berlin",
        entry_date=date(2025, 12, 14),
    )


@pytest.fixture
def mock_get_users_info():
    """Mock get_users_info to return test user data."""

    async def mock_get_users_info_impl(db, user_ids):
        return [{"firstName": "Test", "lastName": "User"} for _ in user_ids]

    with patch(
        "src.services.projects.project_service.get_users_info",
        side_effect=mock_get_users_info_impl,
    ) as mock:
        yield mock


@pytest.mark.asyncio
async def test_create_project(db_session, create_data, setup_defaults):
    """Test creating a new project."""
    project = await project_service.create_project(db=db_session, project=create_data)

    assert project.id is not None
    assert project.name == create_data.name
    assert project.project_type_id == create_data.project_type_id
    assert project.internal_project_number == create_data.internal_project_number
    assert project.project_version == 1
    assert project.latest_version == 1
    assert project.original_created_at is not None


@pytest.mark.asyncio
async def test_create_project_keeps_aggregate_root_project_id_null(db_session, create_data, setup_defaults):
    """Project is the aggregate root, not a child node scoped by its own project_id."""
    project = await project_service.create_project(db=db_session, project=create_data)

    row = (
        await db_session.execute(select(Project).where(Project.id == project.id, Project.project_version == 1))
    ).scalar_one()

    assert row.project_id is None


@pytest.mark.asyncio
async def test_create_project_snapshots_topic_defaults(db_session, create_data, setup_defaults):
    """Project creation should copy python-defined topic defaults into project-owned rows."""
    project = await project_service.create_project(db=db_session, project=create_data)

    topic_result = await db_session.execute(
        select(Topic).where(Topic.project_id == project.id, Topic.name == "Artenschutzrecht")
    )
    copied_topic = topic_result.scalar_one()
    assert copied_topic.description is not None
    assert copied_topic.show_in_mvp is True
    assert copied_topic.show_in_ewm is True
    assert copied_topic.show_in_beschluss is True

    parent_norm_result = await db_session.execute(
        select(TopicNorm).where(
            TopicNorm.project_id == project.id,
            TopicNorm.topic_id == copied_topic.id,
            TopicNorm.jurabk == "BNatSchG",
            TopicNorm.paragraph_nr == "44",
        )
    )
    topic_owned_norm = parent_norm_result.scalar_one()

    sub_topic_result = await db_session.execute(
        select(Subtopic).where(
            Subtopic.project_id == project.id,
            Subtopic.topic_id == copied_topic.id,
            Subtopic.name == "Zugriffsverbote",
        )
    )
    copied_sub_topic = sub_topic_result.scalar_one()

    ausnahmen_sub_topic_result = await db_session.execute(
        select(Subtopic).where(
            Subtopic.project_id == project.id,
            Subtopic.topic_id == copied_topic.id,
            Subtopic.name == "Ausnahmen",
        )
    )
    copied_ausnahmen_sub_topic = ausnahmen_sub_topic_result.scalar_one()

    assert set(topic_owned_norm.frontend_parent_ids) == {
        f"subtopic:{copied_sub_topic.id}",
        f"subtopic:{copied_ausnahmen_sub_topic.id}",
    }

    topic_norms = await TopicService(db_session).get_norms_from_topic(copied_topic.id)
    assert any(norm.id == topic_owned_norm.id for norm in topic_norms)

    bnat_schg_44_norms_result = await db_session.execute(
        select(TopicNorm).where(
            TopicNorm.project_id == project.id,
            TopicNorm.jurabk == "BNatSchG",
            TopicNorm.paragraph_nr == "44",
        )
    )
    bnat_schg_44_norms = bnat_schg_44_norms_result.scalars().all()
    assert len(bnat_schg_44_norms) == EXPECTED_BNAT_SCHG_44_NORM_COUNT

    naturschutz_topic_result = await db_session.execute(
        select(Topic).where(
            Topic.project_id == project.id,
            Topic.name == "Naturschutzrecht",
        )
    )
    naturschutz_topic = naturschutz_topic_result.scalar_one()
    kartierdaten_subtopic_result = await db_session.execute(
        select(Subtopic).where(
            Subtopic.project_id == project.id,
            Subtopic.topic_id == naturschutz_topic.id,
            Subtopic.name == "Kartierdaten / Bestandserfassungen",
        )
    )
    kartierdaten_subtopic = kartierdaten_subtopic_result.scalar_one()
    bnat_schg_17_norms_result = await db_session.execute(
        select(TopicNorm).where(
            TopicNorm.project_id == project.id,
            TopicNorm.topic_id == naturschutz_topic.id,
            TopicNorm.jurabk == "BNatSchG",
            TopicNorm.paragraph_nr == "17",
        )
    )
    bnat_schg_17_norms = bnat_schg_17_norms_result.scalars().all()
    assert any(f"subtopic:{kartierdaten_subtopic.id}" in norm.frontend_parent_ids for norm in bnat_schg_17_norms)

    ewm_only_result = await db_session.execute(
        select(Topic).where(
            Topic.project_id == project.id,
            Topic.name == "Nebenbestimmungen",
        )
    )
    ewm_only_topic = ewm_only_result.scalar_one()
    assert ewm_only_topic.show_in_mvp is False
    assert ewm_only_topic.show_in_ewm is True

    waldschutz_result = await db_session.execute(
        select(Topic).where(
            Topic.project_id == project.id,
            Topic.name == "Waldschutz",
        )
    )
    assert waldschutz_result.scalar_one().show_in_mvp is False

    erschuetterungen_result = await db_session.execute(
        select(Topic).where(
            Topic.project_id == project.id,
            Topic.name == "Immissionsschutz: Erschütterungen",
        )
    )
    assert erschuetterungen_result.scalar_one().show_in_mvp is False
    assert ewm_only_topic.show_in_beschluss is True

    beschluss_only_result = await db_session.execute(
        select(Topic).where(
            Topic.project_id == project.id,
            Topic.name == "Rechtsbehelfsbelehrung",
        )
    )
    beschluss_only_topic = beschluss_only_result.scalar_one()
    assert beschluss_only_topic.show_in_mvp is False
    assert beschluss_only_topic.show_in_ewm is False
    assert beschluss_only_topic.show_in_beschluss is True

    seeded_norms_result = await db_session.execute(
        select(TopicNorm).where(
            TopicNorm.project_id == project.id,
            TopicNorm.is_deleted.is_(False),
        )
    )
    seen_norm_keys: set[tuple[UUID, str, str | None, TopicNormType]] = set()
    duplicate_norm_keys = []
    for norm in seeded_norms_result.scalars():
        key = (norm.topic_id, norm.jurabk, norm.paragraph_nr, norm.type)
        if key in seen_norm_keys:
            duplicate_norm_keys.append(key)
        seen_norm_keys.add(key)

    assert duplicate_norm_keys == []


@pytest.mark.asyncio
async def test_get_project(db_session, create_data, setup_defaults):
    """Test getting a project by ID."""
    created_project = await project_service.create_project(db=db_session, project=create_data)

    retrieved_project = await project_service.get_project(db=db_session, project_id=created_project.id)

    assert retrieved_project is not None
    assert retrieved_project.id == created_project.id
    assert retrieved_project.name == create_data.name
    assert retrieved_project.project_version == 1
    assert retrieved_project.latest_version == 1


@pytest.mark.asyncio
async def test_get_project_not_found(db_session):
    """Test getting a project that doesn't exist."""
    non_existent_id = uuid4()
    with pytest.raises(ProjectNotFoundError):
        await project_service.get_project(db=db_session, project_id=non_existent_id)


@pytest.mark.asyncio
async def test_ensure_project_write_version_rejects_active_version_lock(db_session, create_data, setup_defaults):
    created_project = await project_service.create_project(db=db_session, project=create_data)
    db_session.add(
        ProjectVersionLock(
            project_id=created_project.id,
            source_version=1,
            target_version=2,
            lock_token="active-lock",
            status=ProjectVersionLockStatus.ACTIVE,
        )
    )
    await db_session.commit()

    project = await project_service.get_project(db=db_session, project_id=created_project.id)
    assert project.latest_version == 1
    with pytest.raises(ProjectVersionLockedError):
        await project_service.ensure_project_write_version(
            db=db_session,
            project_id=created_project.id,
            project_version=1,
        )


@pytest.mark.asyncio
async def test_ensure_project_write_version_rejects_stale_version(db_session, create_data, setup_defaults):
    created_project = await project_service.create_project(db=db_session, project=create_data)

    with pytest.raises(VersionNotLatestError):
        await project_service.ensure_project_write_version(
            db=db_session,
            project_id=created_project.id,
            project_version=2,
        )


@pytest.mark.asyncio
async def test_latest_version_stays_on_source_while_version_lock_is_active(db_session, create_data, setup_defaults):
    created_project = await project_service.create_project(db=db_session, project=create_data)
    db_session.add(
        ProjectVersionLock(
            project_id=created_project.id,
            source_version=1,
            target_version=2,
            lock_token="active-lock",
            status=ProjectVersionLockStatus.ACTIVE,
        )
    )
    await db_session.commit()

    await project_service.validate_project_version_lock(
        db=db_session,
        project_id=created_project.id,
        source_version=1,
        target_version=2,
        lock_token="active-lock",
    )

    db_session.add(
        Project(
            id=created_project.id,
            project_id=None,
            project_version=2,
            name=created_project.name,
            project_type_id=created_project.project_type_id,
            created_by_id=created_project.created_by_id,
            entry_date=created_project.entry_date,
            internal_project_number=created_project.internal_project_number,
            state=created_project.state,
            status_id=created_project.status_id,
            current_process_step_id=created_project.current_process_step_id,
            original_created_at=created_project.original_created_at,
        )
    )
    await db_session.commit()

    project = await project_service.get_project(db=db_session, project_id=created_project.id)
    assert project.latest_version == 1
    active_project = await project_service.get_project(db=db_session, project_id=created_project.id)
    assert active_project.project_version == 1
    assert active_project.latest_version == 1
    await project_service.validate_project_version_lock(
        db=db_session,
        project_id=created_project.id,
        source_version=1,
        target_version=2,
        lock_token="active-lock",
    )


@pytest.mark.asyncio
async def test_undo_project_root_version_is_idempotent(db_session, create_data, setup_defaults):
    _default_status, default_type, _new_status, in_creation_status = setup_defaults
    project_id = uuid4()
    applicant_id = uuid4()
    original_created_at = datetime.now(UTC)

    db_session.add_all(
        [
            Applicant(
                id=applicant_id,
                project_id=project_id,
                project_version=1,
                first_name="Ada",
            ),
            Project(
                id=project_id,
                project_id=None,
                project_version=1,
                name="Versioned Project",
                project_type_id=default_type.id,
                created_by_id=create_data.created_by_id,
                entry_date=create_data.entry_date,
                internal_project_number="PV-1",
                state=create_data.state,
                status_id=in_creation_status.id,
                current_process_step_id=None,
                applicant_id=applicant_id,
                original_created_at=original_created_at,
            ),
            Applicant(
                id=applicant_id,
                project_id=project_id,
                project_version=2,
                first_name="Ada",
            ),
            Project(
                id=project_id,
                project_id=None,
                project_version=2,
                name="Versioned Project",
                project_type_id=default_type.id,
                created_by_id=create_data.created_by_id,
                entry_date=create_data.entry_date,
                internal_project_number="PV-1",
                state=create_data.state,
                status_id=in_creation_status.id,
                current_process_step_id=None,
                applicant_id=applicant_id,
                original_created_at=original_created_at,
            ),
        ]
    )
    await db_session.commit()

    assert await _delete_project_root_version(db_session, project_id=project_id, target_version=2) == {
        "project": 1,
        "applicant": 1,
    }
    await db_session.commit()

    assert await _delete_project_root_version(db_session, project_id=project_id, target_version=2) == {
        "project": 0,
        "applicant": 0,
    }


@pytest.mark.asyncio
async def test_copy_project_root_version_preserves_original_created_at(db_session, create_data, setup_defaults):
    created_project = await project_service.create_project(db=db_session, project=create_data)

    result = await copy_project_root_version(
        project_id=created_project.id,
        source_version=1,
        target_version=2,
        dry_run=False,
    )

    assert result == {"copied": 2}

    rows = (
        (
            await db_session.execute(
                select(Project).where(Project.id == created_project.id).order_by(Project.project_version)
            )
        )
        .scalars()
        .all()
    )

    assert [row.project_version for row in rows] == [1, 2]
    assert rows[1].original_created_at == rows[0].original_created_at
    assert rows[1].created_at != rows[0].created_at


@pytest.mark.asyncio
async def test_list_projects(db_session, create_data, setup_defaults):
    """Test listing projects."""
    # Create a project
    await project_service.create_project(db=db_session, project=create_data)

    projects = await project_service.list_projects(db=db_session)

    assert len(projects) == 1
    assert projects[0].name == create_data.name


@pytest.mark.asyncio
async def test_list_projects_filtered_by_name(db_session, create_data, setup_defaults):
    """Test listing projects filtered by name."""
    # Create projects
    await project_service.create_project(db=db_session, project=create_data)

    create_data_2 = CreateProjectRequest(
        name="Another Project",
        project_type_id=create_data.project_type_id,
        internal_project_number="P456",
        created_by_id=uuid4(),
        entry_date=date(2025, 12, 15),
    )
    await project_service.create_project(db=db_session, project=create_data_2)

    # List projects filtered by name
    projects = await project_service.list_projects(db=db_session, name="Test")

    assert len(projects) == 1
    assert projects[0].name == "Test Project"


@pytest.mark.asyncio
async def test_list_projects_filters_by_project_cut_off_datetime(db_session, create_data, setup_defaults, monkeypatch):
    """PROJECT_CUT_OFF_DATE should filter using the timestamp, not only the date."""
    before_project = await project_service.create_project(
        db=db_session,
        project=create_data.model_copy(update={"name": "Before Cutoff", "internal_project_number": "P-before"}),
    )
    at_cutoff_project = await project_service.create_project(
        db=db_session,
        project=create_data.model_copy(update={"name": "At Cutoff", "internal_project_number": "P-at-cutoff"}),
    )

    cutoff = datetime(2026, 5, 28, 8, tzinfo=timezone(timedelta(hours=2)))
    before_cutoff = datetime(2026, 5, 28, 5, 59, tzinfo=UTC)
    at_cutoff = datetime(2026, 5, 28, 6, tzinfo=UTC)

    before_row = (await db_session.execute(select(Project).where(Project.id == before_project.id))).scalar_one()
    before_row.original_created_at = before_cutoff
    at_cutoff_row = (await db_session.execute(select(Project).where(Project.id == at_cutoff_project.id))).scalar_one()
    at_cutoff_row.original_created_at = at_cutoff
    await db_session.commit()

    monkeypatch.setattr(project_service.settings, "PROJECT_CUT_OFF_DATE", cutoff)

    projects = await project_service.list_projects(db=db_session)

    assert {project.name for project in projects} == {"At Cutoff"}


@pytest.mark.asyncio
async def test_update_project(db_session, create_data, setup_defaults):
    """Test updating a project."""
    created_project = await project_service.create_project(db=db_session, project=create_data)

    update_data = UpdateProjectRequest(
        name="Updated Project Name",
        location="Munich",
    )

    updated_project = await project_service.update_project(
        db=db_session,
        project_id=created_project.id,
        data=update_data,
    )

    assert updated_project is not None
    assert updated_project.name == "Updated Project Name"
    assert updated_project.applicant is not None
    assert updated_project.applicant.location == "Munich"


@pytest.mark.asyncio
async def test_update_project_ignores_null_created_by_id(db_session, create_data, setup_defaults):
    """Test that explicit null created_by_id does not clear the existing creator."""
    created_project = await project_service.create_project(db=db_session, project=create_data)

    update_data = UpdateProjectRequest(created_by_id=None)

    updated_project = await project_service.update_project(
        db=db_session,
        project_id=created_project.id,
        data=update_data,
    )

    assert updated_project.created_by_id == create_data.created_by_id


@pytest.mark.asyncio
async def test_update_project_updates_created_by_id_when_value_provided(db_session, create_data, setup_defaults):
    """Test that created_by_id can still be updated when a UUID is provided."""
    created_project = await project_service.create_project(db=db_session, project=create_data)
    new_created_by_id = uuid4()

    update_data = UpdateProjectRequest(created_by_id=new_created_by_id)

    updated_project = await project_service.update_project(
        db=db_session,
        project_id=created_project.id,
        data=update_data,
    )

    assert updated_project.created_by_id == new_created_by_id


@pytest.mark.asyncio
async def test_update_project_creates_applicant_at_current_project_version(db_session, setup_defaults):
    default_status, default_type, *_ = setup_defaults
    create_data = CreateProjectRequest(
        name="Versioned Applicant Project",
        project_type_id=default_type.id,
        status_id=default_status.id,
        internal_project_number="P-V2-APP",
        created_by_id=uuid4(),
        entry_date=date(2025, 12, 14),
    )
    created_project = await project_service.create_project(db=db_session, project=create_data)

    source_project = (
        await db_session.execute(select(Project).where(Project.id == created_project.id, Project.project_version == 1))
    ).scalar_one()
    db_session.add(
        Project(
            id=source_project.id,
            project_version=2,
            name=source_project.name,
            project_type_id=source_project.project_type_id,
            created_by_id=source_project.created_by_id,
            entry_date=source_project.entry_date,
            internal_project_number=source_project.internal_project_number,
            state=source_project.state,
            status_id=source_project.status_id,
            current_process_step_id=source_project.current_process_step_id,
            original_created_at=source_project.original_created_at,
        )
    )
    await db_session.commit()

    updated_project = await project_service.update_project(
        db=db_session,
        project_id=created_project.id,
        data=UpdateProjectRequest(company="Applicant GmbH"),
    )

    assert updated_project.project_version == EXPECTED_PROJECT_VERSION
    applicant = (
        await db_session.execute(
            select(Applicant).where(
                Applicant.id == updated_project.applicant_id,
                Applicant.project_version == EXPECTED_PROJECT_VERSION,
            )
        )
    ).scalar_one()
    assert applicant.company == "Applicant GmbH"


@pytest.mark.asyncio
async def test_update_project_not_found(db_session):
    """Test updating a project that doesn't exist."""
    non_existent_id = uuid4()
    update_data = UpdateProjectRequest(name="Updated Name")

    with pytest.raises(ProjectNotFoundError):
        await project_service.update_project(
            db=db_session,
            project_id=non_existent_id,
            data=update_data,
        )


@pytest.mark.asyncio
async def test_update_project_status(db_session, create_data, setup_defaults):
    """Test updating project status."""
    _default_status, _default_type, _new_status, _in_creation_status = setup_defaults
    created_project = await project_service.create_project(db=db_session, project=create_data)

    update_status_request = UpdateProjectStatusRequest(internal_name=ProjectInternalStatusEnum.IN_PROGRESS)

    updated_project = await project_service.update_project_status(
        db=db_session,
        project_id=created_project.id,
        payload=update_status_request,
    )

    assert updated_project is not None
    # Verify status was updated
    retrieved = await project_service.get_project(db=db_session, project_id=created_project.id)
    assert retrieved.status_name == "In Bearbeitung"


@pytest.mark.asyncio
async def test_update_project_status_not_found(db_session):
    """Test updating status for a project that doesn't exist."""
    non_existent_id = uuid4()
    update_status_request = UpdateProjectStatusRequest(internal_name=ProjectInternalStatusEnum.OPEN)

    with pytest.raises(ProjectNotFoundError):
        await project_service.update_project_status(
            db=db_session,
            project_id=non_existent_id,
            payload=update_status_request,
        )


@pytest.mark.asyncio
async def test_update_project_status_missing_target_status_in_db(db_session, create_data, setup_defaults):
    """Test updating project status when requested status is missing in DB."""
    _, _, new_status, _ = setup_defaults
    await db_session.delete(new_status)
    await db_session.commit()

    created_project = await project_service.create_project(db=db_session, project=create_data)

    update_status_request = UpdateProjectStatusRequest(internal_name=ProjectInternalStatusEnum.IN_PROGRESS)

    with pytest.raises(InvalidStatusError):
        await project_service.update_project_status(
            db=db_session,
            project_id=created_project.id,
            payload=update_status_request,
        )


@pytest.mark.asyncio
async def test_update_project_status_backward_transition_raises(db_session, create_data, setup_defaults):
    """Test that transitioning to a lower status raises InvalidStatusTransitionError."""
    # Project is created with IN_CREATION status; advance it to IN_PROGRESS first
    created_project = await project_service.create_project(db=db_session, project=create_data)
    await project_service.update_project_status(
        db=db_session,
        project_id=created_project.id,
        payload=UpdateProjectStatusRequest(internal_name=ProjectInternalStatusEnum.IN_PROGRESS),
    )

    # Now try to go backwards to OPEN — should raise
    with pytest.raises(InvalidStatusTransitionError):
        await project_service.update_project_status(
            db=db_session,
            project_id=created_project.id,
            payload=UpdateProjectStatusRequest(internal_name=ProjectInternalStatusEnum.OPEN),
        )


@pytest.mark.asyncio
async def test_update_project_status_same_status_is_idempotent(db_session, create_data, setup_defaults):
    """Test that setting the same status is accepted as an idempotent update."""
    created_project = await project_service.create_project(db=db_session, project=create_data)

    updated_project = await project_service.update_project_status(
        db=db_session,
        project_id=created_project.id,
        payload=UpdateProjectStatusRequest(internal_name=ProjectInternalStatusEnum.IN_CREATION),
    )

    assert updated_project.id == created_project.id
    assert updated_project.status_id == created_project.status_id


@pytest.mark.asyncio
async def test_start_project_initialization_starts_workflow(db_session, create_data, setup_defaults):
    created_project = await project_service.create_project(db=db_session, project=create_data)

    handle = AsyncMock()
    handle.describe.return_value = SimpleNamespace(status=SimpleNamespace(name="RUNNING"))

    with patch(
        "src.services.projects.project_service.start_workflow", new=AsyncMock(return_value=handle)
    ) as mock_start:
        response = await project_service.start_project_initialization(
            db=db_session,
            project_id=created_project.id,
        )

    assert response.workflow_status == "RUNNING"
    assert response.message == f"Project initialization workflow started for project '{created_project.id}'."
    mock_start.assert_awaited_once()
    assert mock_start.await_args.kwargs["input"].project_version == created_project.project_version
    assert mock_start.await_args.kwargs["id_reuse_policy"] == project_service.WorkflowIDReusePolicy.REJECT_DUPLICATE
    assert mock_start.await_args.kwargs["project_version"] == created_project.project_version


@pytest.mark.asyncio
async def test_start_project_initialization_returns_existing_status_for_duplicates(
    db_session, create_data, setup_defaults, monkeypatch
):
    created_project = await project_service.create_project(db=db_session, project=create_data)

    class DummyWorkflowAlreadyStartedError(Exception):
        pass

    duplicate_error = DummyWorkflowAlreadyStartedError()
    existing_handle = AsyncMock()
    existing_handle.describe.return_value = SimpleNamespace(status=SimpleNamespace(name="COMPLETED"))
    client = MagicMock()
    client.get_workflow_handle.return_value = existing_handle

    monkeypatch.setattr(project_service, "WorkflowAlreadyStartedError", DummyWorkflowAlreadyStartedError)

    with (
        patch(
            "src.services.projects.project_service.start_workflow",
            new=AsyncMock(side_effect=duplicate_error),
        ),
        patch(
            "src.services.projects.project_service.get_temporal_client",
            new=AsyncMock(return_value=client),
        ),
    ):
        response = await project_service.start_project_initialization(
            db=db_session,
            project_id=created_project.id,
        )

    assert response.workflow_status == "COMPLETED"
    assert response.message == f"Workflow already started for project '{created_project.id}'."
    client.get_workflow_handle.assert_called_once_with(
        f"{project_service.PROJECT_INITIALIZATION_WORKFLOW_ID}-{created_project.id}-v{created_project.project_version}"
    )


@pytest.mark.asyncio
async def test_set_project_deleted_sets_flag(db_session, create_data, setup_defaults):
    """set_project_deleted marks the project as deleted."""
    created_project = await project_service.create_project(db=db_session, project=create_data)

    await project_service.set_project_deleted(db=db_session, project_id=created_project.id)

    result = await db_session.execute(select(Project).where(Project.id == created_project.id))
    project = result.scalar_one()
    assert project.is_deleted is True


@pytest.mark.asyncio
async def test_set_project_deleted_is_noop_for_already_deleted(db_session, create_data, setup_defaults):
    """set_project_deleted is idempotent: no error if project already deleted."""
    created_project = await project_service.create_project(db=db_session, project=create_data)
    await project_service.set_project_deleted(db=db_session, project_id=created_project.id)

    # Second call must not raise.
    await project_service.set_project_deleted(db=db_session, project_id=created_project.id)


@pytest.mark.asyncio
async def test_set_project_deleted_is_noop_for_missing_project(db_session):
    """set_project_deleted is a no-op when the project does not exist."""
    await project_service.set_project_deleted(db=db_session, project_id=uuid4())


@pytest.mark.asyncio
async def test_list_projects_excludes_deleted(db_session, create_data, setup_defaults):
    """list_projects must not return projects with is_deleted=True."""
    created_project = await project_service.create_project(db=db_session, project=create_data)
    await project_service.set_project_deleted(db=db_session, project_id=created_project.id)

    projects = await project_service.list_projects(db=db_session)

    assert all(str(p.id) != str(created_project.id) for p in projects)


@pytest.mark.asyncio
async def test_get_project_raises_for_deleted(db_session, create_data, setup_defaults):
    """get_project raises ProjectNotFoundError for a soft-deleted project."""
    created_project = await project_service.create_project(db=db_session, project=create_data)
    await project_service.set_project_deleted(db=db_session, project_id=created_project.id)

    with pytest.raises(ProjectNotFoundError):
        await project_service.get_project(db=db_session, project_id=created_project.id)


@pytest.mark.asyncio
async def test_start_project_deletion_starts_workflow(db_session, create_data, setup_defaults):
    """start_project_deletion dispatches the deletion workflow."""
    created_project = await project_service.create_project(db=db_session, project=create_data)

    with patch("src.services.projects.project_service.start_workflow", new=AsyncMock()) as mock_start:
        await project_service.start_project_deletion(db=db_session, project_id=created_project.id)

    mock_start.assert_awaited_once()
    assert mock_start.await_args.kwargs["workflow_id"] == project_service.PROJECT_DELETION_WORKFLOW_ID
    assert (
        mock_start.await_args.kwargs["id_reuse_policy"]
        == project_service.WorkflowIDReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY
    )
    assert mock_start.await_args.kwargs["project_version"] == created_project.project_version


@pytest.mark.asyncio
async def test_start_project_deletion_raises_for_not_found(db_session):
    """start_project_deletion raises ProjectNotFoundError when project does not exist."""
    with pytest.raises(ProjectNotFoundError):
        await project_service.start_project_deletion(db=db_session, project_id=uuid4())


@pytest.mark.asyncio
async def test_list_projects_with_spicedb_memberships(
    db_session,
    create_data,
    monkeypatch,
):
    project = await project_service.create_project(db=db_session, project=create_data)

    fake_spicedb_response = {
        str(project.id): {
            "owner": [str(uuid4())],
            "member": [str(uuid4()), str(uuid4())],
        }
    }

    mock_auth_client = AsyncMock()
    mock_auth_client.list_resource_relations_bulk.return_value = fake_spicedb_response

    async def mock_get_auth_client():
        return mock_auth_client

    monkeypatch.setattr("authentification.dependencies.get_auth_client", mock_get_auth_client)

    monkeypatch.setattr("authentification.config.auth_settings", lambda: type("cfg", (), {"mode": "strict"})())

    result = await project_service.list_projects(db_session)

    assert len(result) == 1

    project_result = result[0]

    assert project_result.id == project.id
    assert len(project_result.members) == EXPECTED_MEMBER_COUNT
    assert len(project_result.owners) == 1

    # verify SpiceDB was called correctly
    mock_auth_client.list_resource_relations_bulk.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_project_with_spicedb_memberships(
    db_session,
    create_data,
    monkeypatch,
):
    project = await project_service.create_project(db=db_session, project=create_data)

    fake_spicedb_response = {
        str(project.id): {
            "owner": [str(uuid4())],
            "member": [str(uuid4()), str(uuid4())],
        }
    }

    mock_auth_client = AsyncMock()
    mock_auth_client.list_resource_relations_bulk.return_value = fake_spicedb_response

    async def mock_get_auth_client():
        return mock_auth_client

    monkeypatch.setattr("authentification.dependencies.get_auth_client", mock_get_auth_client)

    # Also ensure auth is enabled
    monkeypatch.setattr("authentification.config.auth_settings", lambda: type("cfg", (), {"mode": "strict"})())

    result = await project_service.get_project(db=db_session, project_id=project.id)

    assert result is not None
    assert result.id == project.id

    assert len(result.members) == EXPECTED_MEMBER_COUNT
    assert len(result.owners) == 1

    mock_auth_client.list_resource_relations_bulk.assert_awaited_once()
