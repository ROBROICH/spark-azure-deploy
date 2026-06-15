from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any, Final
from uuid import UUID

from audit_client import ChangeType, record_audit_entry
from audit_client.workflow import workflow_actor_context_from_request_kwargs
from authentification.auth import AuthClient
from authentification.enums import AuthMode, Relation, Resource, Subject
from event_logging.enums import EventAction, EventCategory, EventOutcome
from node_crud.exceptions import ProjectVersionLockedError, VersionNotLatestError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from temporal import get_temporal_client, project_scoped_workflow_id, start_workflow
from temporal.workflows.project_lifecycle.project_lifecycle import (
    PROJECT_DELETION_WORKFLOW_ID,
    PROJECT_INITIALIZATION_WORKFLOW_ID,
)
from temporalio.common import WorkflowIDConflictPolicy, WorkflowIDReusePolicy
from temporalio.exceptions import WorkflowAlreadyStartedError

from src.config.settings import settings
from src.exceptions import (
    DuplicateProjectError,
    InvalidStatusError,
    InvalidStatusTransitionError,
    ProjectNotFoundError,
)
from src.models.db.topic_enum import TopicNormType
from src.models.db.workflow_enum import ProjectVersionLockStatus, WorkflowStatusEnum
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
from src.models.schemas.project_initialization import ProjectInitializationResponse
from src.models.schemas.project_schemas import (
    CreateProjectRequest,
    GermanState,
    ProjectInternalStatusEnum,
    ProjectResponse,
    UpdateProjectRequest,
    UpdateProjectStatusRequest,
)
from src.services.projects.default_topic_seed_data import (
    SubtopicSeed,
    TopicNormSeed,
    TopicSeed,
    get_default_topics_for_project_type_name,
)
from src.services.workflows.workflow_models import DeleteProjectInput, ProjectInitializationInput
from src.utils.logger import logger

DEFAULT_TOPIC_NORM_FLUSH_BATCH_SIZE = 50
DEFAULT_TOPIC_FLUSH_BATCH_SIZE = 10


def _build_default_topic_norms(
    *,
    project_id: UUID,
    topics_with_defaults: list[tuple[Topic, TopicSeed]],
    subtopics_with_defaults: list[tuple[Topic, Subtopic, SubtopicSeed]],
) -> list[TopicNorm]:
    topic_norms_to_create: list[TopicNorm] = []
    topic_norms_by_key: dict[tuple[UUID, str, str | None, TopicNormType], TopicNorm] = {}

    norm_sources: list[tuple[UUID, TopicNormSeed, TopicNormType, UUID | None]] = []
    for topic, topic_default in topics_with_defaults:
        norm_sources.extend((topic.id, norm, TopicNormType.PRUEFUNG, None) for norm in topic_default.pruefungs_norms)
        norm_sources.extend((topic.id, norm, TopicNormType.VERFAHREN, None) for norm in topic_default.verfahrens_norms)

    for topic, subtopic, subtopic_default in subtopics_with_defaults:
        norm_sources.extend(
            (topic.id, norm, TopicNormType.PRUEFUNG, subtopic.id) for norm in subtopic_default.pruefungs_norms
        )
        norm_sources.extend(
            (topic.id, norm, TopicNormType.VERFAHREN, subtopic.id) for norm in subtopic_default.verfahrens_norms
        )

    for topic_id, norm_default, norm_type, subtopic_id in norm_sources:
        key = (
            topic_id,
            norm_default.jurabk,
            norm_default.paragraph_nr,
            norm_type,
        )
        topic_norm = topic_norms_by_key.get(key)
        if topic_norm is None:
            # Temporary seed-time dedupe: downstream workflows and the FE currently
            # only distinguish norms by law and paragraph. Remove this when
            # absatz/satz/nummer are supported end to end.
            topic_norm = TopicNorm(
                project_id=project_id,
                topic_id=topic_id,
                frontend_parent_ids=[],
                jurabk=norm_default.jurabk,
                paragraph_nr=norm_default.paragraph_nr,
                satz=norm_default.satz,
                absatz=norm_default.absatz,
                nummer=norm_default.nummer,
                type=norm_type,
            )
            topic_norms_by_key[key] = topic_norm
            topic_norms_to_create.append(topic_norm)

        if subtopic_id is not None:
            frontend_parent_id = f"subtopic:{subtopic_id}"
            if frontend_parent_id not in topic_norm.frontend_parent_ids:
                topic_norm.frontend_parent_ids.append(frontend_parent_id)

    return topic_norms_to_create


def _latest_project_versions_subquery():
    active_locks = (
        select(
            ProjectVersionLock.project_id.label("project_id"),
            ProjectVersionLock.source_version.label("source_version"),
        )
        .where(ProjectVersionLock.status == ProjectVersionLockStatus.ACTIVE)
        .subquery()
    )
    return (
        select(
            Project.id.label("project_id"),
            func.coalesce(
                active_locks.c.source_version,
                func.max(Project.project_version),
            ).label("project_version"),
        )
        .outerjoin(active_locks, active_locks.c.project_id == Project.id)
        .where(Project.is_deleted.is_(False))
        .group_by(Project.id, active_locks.c.source_version)
        .subquery()
    )


async def list_projects(
    db: AsyncSession,
    name: str | None = None,
    status: list[ProjectInternalStatusEnum] | None = None,
    assigned_project_ids: list[UUID] | None = None,
) -> Sequence[ProjectResponse]:
    """Retrieve a list of all projects, optionally filtered by name.

    Args:
        assigned_project_ids: If provided list of projects ids the result is filtered by
        status: If provided list of projects statuses the result is filtered by
        db: Async database session
        name: Optional filter string for project name

    Returns:
        List of matching Project instances
    """
    latest_projects = _latest_project_versions_subquery()
    query = (
        select(
            Project,
            ProjectType.name.label("project_type_name"),
            ProjectStatus.name.label("status_name"),
        )
        .join(
            latest_projects,
            (Project.id == latest_projects.c.project_id)
            & (Project.project_version == latest_projects.c.project_version),
        )
        .join(ProjectType, Project.project_type_id == ProjectType.id)
        .join(ProjectStatus, Project.status_id == ProjectStatus.id)
        .options(selectinload(Project.applicant))
    )

    query = query.where(Project.is_deleted.is_(False))

    if name:
        query = query.where(Project.name.ilike(f"%{name}%"))

    if assigned_project_ids:
        query = query.where(Project.id.in_(assigned_project_ids))

    if status:
        query = query.where(ProjectStatus.internal_name.in_(status))

    if settings.PROJECT_CUT_OFF_DATE:
        query = query.where(Project.original_created_at >= settings.PROJECT_CUT_OFF_DATE)

    result = await db.execute(query)
    rows = result.all()

    projects = []
    memberships = await _get_project_memberships(
        project_ids=[project.id for project, _, _ in rows],
        relations=[Relation.OWNER, Relation.MEMBER, Relation.AUDITOR],
    )

    for project, project_type_name, status_name in rows:
        # Extract applicant fields if applicant exists
        applicant_dict = {}
        if project.applicant:
            applicant_dict = {
                "salutation": project.applicant.salutation,
                "company": project.applicant.company,
                "first_name": project.applicant.first_name,
                "last_name": project.applicant.last_name,
                "street": project.applicant.street,
                "house_number": project.applicant.house_number,
                "address_supplement": project.applicant.address_supplement,
                "plz": project.applicant.plz,
                "location": project.applicant.location,
                "country": project.applicant.country,
                "email": project.applicant.email,
                "phone": project.applicant.phone,
                "fax": project.applicant.fax,
            }

        project_dict = {**project.__dict__}
        # Remove applicant_id from project_dict as it's not in ProjectResponse
        project_dict.pop("applicant_id", None)
        project_dict.pop("applicant", None)  # Remove relationship object

        project_memberships = memberships.get(project.id, {})
        projects.append(
            ProjectResponse(
                **project_dict,
                **applicant_dict,
                members=project_memberships.get(Relation.MEMBER, []),
                owners=project_memberships.get(Relation.OWNER, []),
                auditors=project_memberships.get(Relation.AUDITOR, []),
                project_type_name=project_type_name,
                status_name=status_name,
                latest_version=project.project_version,
            )
        )

    return projects


async def get_project_orm(db: AsyncSession, project_id: UUID) -> Project | None:
    """Get project ORM object by ID.

    Args:
        db: Database session
        project_id: Project ID

    Returns:
        Project if found, None otherwise
    """
    latest_projects = _latest_project_versions_subquery()
    result = await db.execute(
        select(Project)
        .join(
            latest_projects,
            (Project.id == latest_projects.c.project_id)
            & (Project.project_version == latest_projects.c.project_version),
        )
        .where(Project.id == project_id, Project.is_deleted.is_(False))
        .limit(1)
        .options(selectinload(Project.applicant))
    )
    return result.scalar_one_or_none()


async def get_project(db: AsyncSession, project_id: UUID) -> ProjectResponse:
    """Retrieve a single project by its unique ID, including project type and status names.

    Args:
        db: Async database session
        project_id: Unique identifier of the project

    Returns:
        The ProjectResponse instance if found

    Raises:
        ProjectNotFoundError: If project is not found
    """
    latest_projects = _latest_project_versions_subquery()
    query = (
        select(
            Project,
            ProjectType.name.label("project_type_name"),
            ProjectStatus.name.label("status_name"),
        )
        .join(
            latest_projects,
            (Project.id == latest_projects.c.project_id)
            & (Project.project_version == latest_projects.c.project_version),
        )
        .join(ProjectType, Project.project_type_id == ProjectType.id)
        .join(ProjectStatus, Project.status_id == ProjectStatus.id)
        .where(Project.id == project_id, Project.is_deleted.is_(False))
        .limit(1)
        .options(selectinload(Project.applicant))
    )

    result = await db.execute(query)
    row = result.fetchone()

    if row is None:
        raise ProjectNotFoundError(str(project_id))

    project, project_type_name, status_name = row

    # Extract applicant fields if applicant exists
    applicant_dict = {}
    if project.applicant:
        applicant_dict = {
            "salutation": project.applicant.salutation,
            "company": project.applicant.company,
            "first_name": project.applicant.first_name,
            "last_name": project.applicant.last_name,
            "street": project.applicant.street,
            "house_number": project.applicant.house_number,
            "address_supplement": project.applicant.address_supplement,
            "plz": project.applicant.plz,
            "location": project.applicant.location,
            "country": project.applicant.country,
            "email": project.applicant.email,
            "phone": project.applicant.phone,
            "fax": project.applicant.fax,
        }

    project_dict = {**project.__dict__}
    # Remove fields not in ProjectResponse
    project_dict.pop("applicant_id", None)
    project_dict.pop("applicant", None)

    memberships = await _get_project_memberships(
        project_ids=[project_id],
        relations=[Relation.OWNER, Relation.MEMBER, Relation.AUDITOR],
    )

    project_memberships = memberships.get(project_id) or {}

    return ProjectResponse(
        **project_dict,
        **applicant_dict,
        members=project_memberships.get(Relation.MEMBER, []),
        owners=project_memberships.get(Relation.OWNER, []),
        auditors=project_memberships.get(Relation.AUDITOR, []),
        project_type_name=project_type_name,
        status_name=status_name,
        latest_version=project.project_version,
    )


async def _check_internal_number_conflict(db: AsyncSession, project: CreateProjectRequest) -> None:
    """Validate that no existing project uses the same internal project number.

    Args:
        db: Async SQLAlchemy session used to execute the query.
        project: The project creation request containing the internal project number.

    Raises:
        DuplicateProjectError: If a project with the same internal project number already exists.
    """
    result = await db.execute(
        select(Project.id)
        .where(
            Project.internal_project_number == project.internal_project_number,
            Project.is_deleted.is_(False),
        )
        .limit(1)
    )
    if result.scalar_one_or_none() is not None:
        raise DuplicateProjectError(name=project.internal_project_number)


async def create_project(
    db: AsyncSession,
    project: CreateProjectRequest,
    auth_client: AuthClient | None = None,
    audit_context: dict[str, Any] | None = None,
) -> ProjectResponse:
    """Create a new project record.

    Args:
        db: Async database session
        project: Project creation data
        auth_client: If provided will create an owner relation with the creator id

    Returns:
        The newly created ProjectResponse instance
    """
    # Retrieve initial project status
    status = await db.execute(
        select(ProjectStatus).where(ProjectStatus.internal_name == ProjectInternalStatusEnum.IN_CREATION.value)
    )
    default_status = status.scalar_one_or_none()
    if not default_status:
        raise ValueError("Default project status not found.")

    await _check_internal_number_conflict(db=db, project=project)

    project_type_result = await db.execute(select(ProjectType).where(ProjectType.id == project.project_type_id))
    db_project_type = project_type_result.scalar_one_or_none()
    if db_project_type is None:
        raise ValueError(f"Project type {project.project_type_id} not found.")

    db_project = Project(
        name=project.name,
        project_type_id=project.project_type_id,
        created_by_id=project.created_by_id,
        entry_date=project.entry_date,
        internal_project_number=project.internal_project_number,
        state=project.state,
        status_id=default_status.id,
        current_process_step_id=None,
        imported=project.imported if project.imported is not None else False,
        original_created_at=datetime.now(UTC),
    )

    try:
        db.add(db_project)
        await db.flush()
        await db.refresh(db_project)

        # Create applicant if applicant data is provided
        if any(
            [
                project.salutation,
                project.company,
                project.first_name,
                project.last_name,
                project.street,
                project.house_number,
                project.address_supplement,
                project.plz,
                project.location,
                project.country,
                project.email,
                project.phone,
                project.fax,
            ]
        ):
            db_applicant = Applicant(
                project_id=db_project.id,
                project_version=db_project.project_version,
                salutation=project.salutation,
                company=project.company,
                first_name=project.first_name,
                last_name=project.last_name,
                street=project.street,
                house_number=project.house_number,
                address_supplement=project.address_supplement,
                plz=project.plz,
                location=project.location,
                country=project.country,
                email=project.email,
                phone=project.phone,
                fax=project.fax,
            )
            db.add(db_applicant)
            await db.flush()
            db_project.applicant_id = db_applicant.id

            if audit_context is not None:
                await record_audit_entry(
                    db,
                    project_id=db_project.id,
                    entity_type="applicant",
                    change_type=ChangeType.CREATE,
                    entity_id=db_applicant.id,
                    **audit_context,
                )

        await create_default_topics_for_project(
            db=db,
            project_id=db_project.id,
            project_type_name=db_project_type.name,
            state=db_project.state,
            audit_context=audit_context,
        )

        if auth_client:
            await auth_client.create_relationship(
                resource_type=Resource.PROJECT,
                resource_id=str(db_project.id),
                relation=Relation.OWNER,
                subject_type=Subject.USER,
                subject_id=str(project.created_by_id),
            )
        if audit_context is not None:
            await record_audit_entry(
                db,
                project_id=db_project.id,
                entity_type="project",
                change_type=ChangeType.CREATE,
                entity_id=db_project.id,
                **audit_context,
            )
        await db.commit()

    except Exception as e:
        logger.error(
            action=EventAction.WRITE,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.DATABASE,
            message=f"Creation of project failed: {e}",
        )
        if auth_client:
            try:
                await auth_client.delete_relationship(
                    resource_type=Resource.PROJECT,
                    resource_id=str(db_project.id),
                    relation=Relation.OWNER,
                    subject_type=Subject.USER,
                    subject_id=str(project.created_by_id),
                )
            except Exception as cleanup_err:
                logger.error(
                    action=EventAction.WRITE,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.AUTHENTICATION,
                    message=f"ReBAC cleanup failed after DB error: {cleanup_err}",
                )
        await db.rollback()
        raise e

    # Return ProjectResponse directly to avoid double lookup in routes
    project_response = await get_project(db=db, project_id=db_project.id)
    if not project_response:
        raise ValueError("Failed to retrieve created project")
    return project_response


APPLICANT_FIELDS: Final[frozenset[str]] = frozenset(
    {
        "salutation",
        "company",
        "first_name",
        "last_name",
        "street",
        "house_number",
        "address_supplement",
        "plz",
        "location",
        "country",
        "email",
        "phone",
        "fax",
    }
)


def _split_update_payload(
    data: UpdateProjectRequest,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Split an update payload into applicant-bound and project-bound fields."""
    applicant_data: dict[str, Any] = {}
    project_data: dict[str, Any] = {}
    for field, value in data.model_dump(exclude_unset=True, by_alias=False).items():
        if field == "created_by_id" and value is None:
            continue
        target = applicant_data if field in APPLICANT_FIELDS else project_data
        target[field] = value
    return applicant_data, project_data


async def _upsert_applicant(
    db: AsyncSession,
    project: Project,
    applicant_data: dict[str, Any],
) -> tuple[ChangeType, UUID] | None:
    """Update the existing applicant or create a new one."""
    if not applicant_data:
        return None

    if project.applicant_id and project.applicant:
        for field, value in applicant_data.items():
            setattr(project.applicant, field, value)
        return ChangeType.UPDATE, project.applicant.id

    if not project.applicant_id:
        db_applicant = Applicant(
            project_id=project.id,
            project_version=project.project_version,
            **applicant_data,
        )
        db.add(db_applicant)
        await db.flush()
        project.applicant_id = db_applicant.id
        project.applicant = db_applicant
        return ChangeType.CREATE, db_applicant.id

    return None


async def update_project(
    db: AsyncSession,
    project_id: UUID,
    data: UpdateProjectRequest,
    audit_context: dict[str, Any] | None = None,
) -> Project:
    """Update an existing project with provided fields.

    Args:
        db: Async database session
        project_id: Unique identifier of the project to update
        data: Data to update the project with
        audit_context: Optional audit context for tracking changes

    Returns:
        Updated Project instance

    Raises:
        ProjectNotFoundError: If project is not found
    """
    project = await get_project_orm(db=db, project_id=project_id)
    if not project:
        raise ProjectNotFoundError(str(project_id))

    applicant_data, project_data = _split_update_payload(data)
    applicant_audit = await _upsert_applicant(db, project, applicant_data)

    for field, value in project_data.items():
        setattr(project, field, value)

    if audit_context is not None:
        if project_data:
            await record_audit_entry(
                db,
                project_id=project_id,
                entity_type="project",
                change_type=ChangeType.UPDATE,
                entity_id=project_id,
                **audit_context,
            )
        if applicant_audit is not None:
            applicant_change_type, applicant_entity_id = applicant_audit
            await record_audit_entry(
                db,
                project_id=project_id,
                entity_type="applicant",
                change_type=applicant_change_type,
                entity_id=applicant_entity_id,
                **audit_context,
            )

    await db.commit()
    await db.refresh(project)
    return project


def _status_transition_order(internal_name: str | None) -> int:
    """Map status internal_name to transition order, unknown values sort lowest."""
    if not internal_name:
        return -1
    try:
        return ProjectInternalStatusEnum(internal_name).transition_order
    except ValueError:
        return -1


async def update_project_status(
    db: AsyncSession,
    project_id: UUID,
    payload: UpdateProjectStatusRequest,
    audit_context: dict[str, Any] | None = None,
) -> Project:
    """Update the status of a project.

    Note: This function does NOT handle project transition side effects
    (e.g., queuing jobs). Those should be handled by the calling service
    (e.g., the main backend service that handles agent triggers).

    Args:
        db: SQLAlchemy async session for database operations
        project_id: Unique identifier of the project to update
        payload: Request payload containing the target status name

    Returns:
        The updated Project object

    Raises:
        ProjectNotFoundError: If the project is not found
        InvalidStatusError: If the requested status does not exist in the database
        InvalidStatusTransitionError: If the transition goes backwards in the flow
    """
    project = await get_project_orm(db=db, project_id=project_id)

    if not project:
        raise ProjectNotFoundError(str(project_id))

    current_status_result = await db.execute(select(ProjectStatus).where(ProjectStatus.id == project.status_id))
    current_status = current_status_result.scalar_one_or_none()

    result = await db.execute(select(ProjectStatus).where(ProjectStatus.internal_name == payload.internal_name.value))
    status_obj = result.scalar_one_or_none()
    if not status_obj:
        raise InvalidStatusError(payload.internal_name.value)

    if current_status and current_status.internal_name == status_obj.internal_name:
        return project

    current_order = _status_transition_order(current_status.internal_name if current_status else None)
    new_order = payload.internal_name.transition_order
    if new_order <= current_order:
        raise InvalidStatusTransitionError(
            current_status.internal_name if current_status else "UNKNOWN",
            status_obj.internal_name,
        )

    project.status_id = status_obj.id

    if audit_context is not None:
        await record_audit_entry(
            db,
            project_id=project_id,
            entity_type="project",
            change_type=ChangeType.UPDATE,
            entity_id=project_id,
            **audit_context,
        )

    await db.commit()
    await db.refresh(project)

    # NOTE: Project transition handling (e.g., job queuing) is excluded
    # from this service as it involves agent triggers. The main backend
    # service should handle those transitions.

    return project


async def create_default_topics_for_project(
    db: AsyncSession,
    project_id: UUID,
    project_type_name: str,
    state: GermanState,
    audit_context: dict[str, Any] | None = None,
) -> None:
    """Create the default topics and norms for a project inside the active transaction."""
    topic_defaults = get_default_topics_for_project_type_name(project_type_name=project_type_name, state=state)
    if not topic_defaults:
        return

    topics_with_defaults: list[tuple[Topic, TopicSeed]] = []
    subtopics_with_defaults: list[tuple[Topic, Subtopic, SubtopicSeed]] = []

    def create_topic(topic_default: TopicSeed) -> Topic:
        topic = Topic(
            project_id=project_id,
            name=topic_default.name,
            show_in_mvp=topic_default.show_in_mvp,
            show_in_ewm=topic_default.show_in_ewm,
            show_in_beschluss=topic_default.show_in_beschluss,
            description=topic_default.description,
        )
        topics_with_defaults.append((topic, topic_default))
        return topic

    def create_subtopic(topic: Topic, subtopic_default: SubtopicSeed) -> Subtopic:
        subtopic = Subtopic(
            project_id=project_id,
            topic_id=topic.id,
            name=subtopic_default.name,
            show_in_mvp=subtopic_default.show_in_mvp,
            show_in_ewm=subtopic_default.show_in_ewm,
            show_in_beschluss=subtopic_default.show_in_beschluss,
            description=subtopic_default.description,
        )
        subtopics_with_defaults.append((topic, subtopic, subtopic_default))
        return subtopic

    topics_to_create: list[Topic] = []
    for topic_default in topic_defaults:
        topics_to_create.append(create_topic(topic_default))

    for i in range(0, len(topics_to_create), DEFAULT_TOPIC_FLUSH_BATCH_SIZE):
        db.add_all(topics_to_create[i : i + DEFAULT_TOPIC_FLUSH_BATCH_SIZE])
        await db.flush()

    if audit_context is not None:
        for topic in topics_to_create:
            await record_audit_entry(
                db,
                project_id=project_id,
                entity_type="topic",
                change_type=ChangeType.CREATE,
                entity_id=topic.id,
                **audit_context,
            )

    sub_topics_to_create: list[Subtopic] = []
    for topic, topic_default in topics_with_defaults:
        for sub_topic_default in topic_default.sub_topics:
            sub_topics_to_create.append(create_subtopic(topic, sub_topic_default))

    if sub_topics_to_create:
        for i in range(0, len(sub_topics_to_create), DEFAULT_TOPIC_FLUSH_BATCH_SIZE):
            db.add_all(sub_topics_to_create[i : i + DEFAULT_TOPIC_FLUSH_BATCH_SIZE])
            await db.flush()

    # --- Phase 2: Build norm objects ---
    topic_norms_to_create = _build_default_topic_norms(
        project_id=project_id,
        topics_with_defaults=topics_with_defaults,
        subtopics_with_defaults=subtopics_with_defaults,
    )

    if topic_norms_to_create:
        for i in range(0, len(topic_norms_to_create), DEFAULT_TOPIC_NORM_FLUSH_BATCH_SIZE):
            db.add_all(topic_norms_to_create[i : i + DEFAULT_TOPIC_NORM_FLUSH_BATCH_SIZE])
            await db.flush()


async def start_project_initialization(
    db: AsyncSession,
    project_id: UUID,
    audit_context: dict[str, Any] | None = None,
) -> ProjectInitializationResponse:
    """Start project initialization."""
    project = await get_project(db=db, project_id=project_id)

    data = ProjectInitializationInput(
        project_id=project_id,
        project_type_id=project.project_type_id,
        project_version=project.project_version,
    )
    try:
        handle = await start_workflow(
            workflow_id=PROJECT_INITIALIZATION_WORKFLOW_ID,
            input=data,
            task_queue=settings.TEMPORAL.TASK_QUEUE,
            project_id=str(data.project_id),
            project_version=project.project_version,
            id_reuse_policy=WorkflowIDReusePolicy.REJECT_DUPLICATE,
            id_conflict_policy=WorkflowIDConflictPolicy.USE_EXISTING,
        )
        description = await handle.describe()
        resolved_status = WorkflowStatusEnum(description.status.name)

        if audit_context is not None:
            await record_audit_entry(
                db,
                project_id=project_id,
                entity_type="project",
                change_type=ChangeType.ACTION,
                action_type="project_initialization",
                entity_id=project_id,
                **audit_context,
            )
            await db.commit()

        return ProjectInitializationResponse(
            message=f"Project initialization workflow started for project '{project_id}'.",
            workflow_status=resolved_status,
        )
    except WorkflowAlreadyStartedError:
        client = await get_temporal_client()
        execution_id = project_scoped_workflow_id(
            str(PROJECT_INITIALIZATION_WORKFLOW_ID),
            project_id,
            project.project_version,
        )
        handle = client.get_workflow_handle(execution_id)
        description = await handle.describe()
        resolved_status = WorkflowStatusEnum(description.status.name)

        return ProjectInitializationResponse(
            message=f"Workflow already started for project '{project_id}'.",
            workflow_status=resolved_status,
        )
    except Exception as e:
        logger.error(
            action=EventAction.NOTIFY,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.FILE,
            message=f"Failed to start workflow for project {data.project_id}: {e}",
        )
        raise


async def set_project_deleted(
    db: AsyncSession,
    project_id: UUID,
    audit_context: dict[str, Any] | None = None,
) -> None:
    """Set is_deleted=True on a project. Called from the Temporal activity.

    Idempotent: no-op if the project is already deleted or does not exist.

    Args:
        db: Async database session
        project_id: ID of the project to soft-delete
    """
    result = await db.execute(select(Project).where(Project.id == project_id, Project.is_deleted.is_(False)))
    projects = result.scalars().all()
    if not projects:
        return

    for project in projects:
        project.is_deleted = True
    if audit_context is not None:
        await record_audit_entry(
            db,
            project_id=project_id,
            entity_type="project",
            change_type=ChangeType.DELETE,
            entity_id=project_id,
            **audit_context,
        )
    await db.commit()


async def start_project_deletion(
    db: AsyncSession,
    project_id: UUID,
    audit_context: dict[str, Any] | None = None,
) -> None:
    """Start the project deletion workflow.

    Args:
        db: Async database session
        project_id: ID of the project to delete

    Raises:
        ProjectNotFoundError: If project is not found or already deleted
    """
    project = await get_project(db=db, project_id=project_id)

    workflow_actor = workflow_actor_context_from_request_kwargs(audit_context) if audit_context is not None else None
    data = DeleteProjectInput(project_id=project_id, workflow_actor=workflow_actor)
    try:
        await start_workflow(
            workflow_id=PROJECT_DELETION_WORKFLOW_ID,
            input=data,
            task_queue=settings.TEMPORAL.TASK_QUEUE,
            project_id=str(project_id),
            project_version=project.project_version,
            id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
            id_conflict_policy=WorkflowIDConflictPolicy.USE_EXISTING,
        )
    except Exception as e:
        logger.error(
            action=EventAction.NOTIFY,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.FILE,
            message=f"Failed to start deletion workflow for project {project_id}: {e}",
        )
        raise


async def ensure_project_write_version(db: AsyncSession, project_id: UUID, project_version: int) -> int:
    active_lock = await db.execute(
        select(ProjectVersionLock.id)
        .where(
            ProjectVersionLock.project_id == project_id,
            ProjectVersionLock.status == ProjectVersionLockStatus.ACTIVE,
        )
        .limit(1)
    )
    if active_lock.scalar_one_or_none() is not None:
        raise ProjectVersionLockedError(str(project_id))

    project = await get_project_orm(db=db, project_id=project_id)
    if project is None:
        raise ProjectNotFoundError(str(project_id))
    latest_version = project.project_version
    if project_version != latest_version:
        raise VersionNotLatestError(provided_version=project_version, latest_version=latest_version)
    return latest_version


async def validate_project_version_lock(
    db: AsyncSession,
    project_id: UUID,
    source_version: int,
    target_version: int,
    lock_token: str,
) -> None:
    project = await get_project_orm(db=db, project_id=project_id)
    if project is None:
        raise ProjectNotFoundError(str(project_id))
    latest_version = project.project_version
    if source_version != latest_version:
        raise VersionNotLatestError(provided_version=source_version, latest_version=latest_version)

    result = await db.execute(
        select(ProjectVersionLock.id).where(
            ProjectVersionLock.project_id == project_id,
            ProjectVersionLock.source_version == source_version,
            ProjectVersionLock.target_version == target_version,
            ProjectVersionLock.lock_token == lock_token,
            ProjectVersionLock.status == ProjectVersionLockStatus.ACTIVE,
        )
    )
    if result.scalar_one_or_none() is None:
        raise ValueError("Project version lock is not active or does not match the requested version")


async def _get_project_memberships(
    project_ids: list[UUID],
    relations: list[Relation],
) -> dict[UUID, dict[Relation, list[UUID]]]:
    """Fetches the list of memberships for a project."""

    from authentification.config import auth_settings
    from authentification.dependencies import get_auth_client

    if auth_settings().mode == AuthMode.DISABLED:
        return {}

    auth_client: AuthClient = await get_auth_client()

    raw = await auth_client.list_resource_relations_bulk(
        resource_type=Resource.PROJECT,
        resource_ids=[str(pid) for pid in project_ids],
        relations=relations,
        subject_type=Subject.USER,
    )

    result: dict[UUID, dict[Relation, list[UUID]]] = {}

    for resource_id, rel_map in raw.items():
        project_uuid = UUID(resource_id)

        result[project_uuid] = {
            relation: [
                UUID(subject_id)
                for subject_id in rel_map.get(
                    relation.value if hasattr(relation, "value") else str(relation),
                    [],
                )
            ]
            for relation in relations
        }

    return result
