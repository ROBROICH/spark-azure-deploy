"""Test configuration and fixtures."""

import os

# Force pure-Python psycopg to avoid segfaults with psycopg-binary + pglite.
os.environ["PSYCOPG_IMPL"] = "python"

import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, date, datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from py_pglite.config import PGliteConfig
from py_pglite.sqlalchemy.manager_async import SQLAlchemyAsyncPGliteManager
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from src.models.schemas.topic_schemas import CreateTopicRequest, TopicResponse

# Set test DATABASE_URL before importing settings to avoid validation error
DATABASE_URL = "postgresql+asyncpg://test:test@localhost:5432/test_db"
os.environ["DATABASE_URL"] = DATABASE_URL
os.environ.setdefault("DB_USER", "test")
os.environ.setdefault("DB_PASSWORD", "test")
os.environ.setdefault("DB_HOST", "localhost")
os.environ.setdefault("DB_PORT", "5432")
os.environ.setdefault("DB_NAME", "test_db")
os.environ["AUTH_MODE"] = "disabled"
os.environ.setdefault("TEMPORAL__S3_ACCESS_KEY_ID", "test")
os.environ.setdefault("TEMPORAL__S3_SECRET_ACCESS_KEY", "test")

from uuid import UUID  # noqa: E402

from fastapi import status  # noqa: E402

from src.config.settings import settings  # noqa: E402
from src.main import app  # noqa: E402
from src.models.db.database import get_db_session  # noqa: E402
from src.models.db_models import (  # noqa: E402
    Applicant,
    Base,
    Deadline,
    ProcessStep,
    Project,
    ProjectStatus,
    ProjectType,
)
from src.services.projects.default_topic_seed_data import (  # noqa: E402
    DEFAULT_PROJECT_TYPE_NAME,
)


@pytest.fixture(autouse=True)
def _pglite_friendly_batch_size():
    """Reduce TopicNorm flush batch size so PGlite does not crash on large INSERTs."""
    import src.services.projects.project_service as ps  # noqa: PLC0415  # imported inside fixture to patch a module global

    original = ps.DEFAULT_TOPIC_NORM_FLUSH_BATCH_SIZE
    ps.DEFAULT_TOPIC_NORM_FLUSH_BATCH_SIZE = 10
    yield
    ps.DEFAULT_TOPIC_NORM_FLUSH_BATCH_SIZE = original


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    for item in items:
        item.add_marker(pytest.mark.timeout(120))
        if "/tests/unit/" in str(item.fspath):
            item.add_marker(pytest.mark.integration)


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    if exitstatus == pytest.ExitCode.NO_TESTS_COLLECTED:
        session.exitstatus = pytest.ExitCode.OK


@pytest_asyncio.fixture(scope="session")
async def pglite() -> AsyncGenerator[SQLAlchemyAsyncPGliteManager]:
    manager = SQLAlchemyAsyncPGliteManager(PGliteConfig())
    manager.start()
    await manager.wait_for_ready()
    yield manager
    await manager.stop()


@pytest.fixture(scope="session", autouse=True)
def override_database_url(pglite: SQLAlchemyAsyncPGliteManager):
    """Override DATABASE_URL to use test database for all tests."""
    original_value = getattr(settings, "DATABASE_URL", None)
    settings.DATABASE_URL = pglite.config.get_connection_string(driver="psycopg")

    # Reset the global database engine to force reinitialization with test URL
    import src.models.db.database as db_module  # noqa: PLC0415  # imported inside fixture to reset module globals

    db_module._async_engine = None
    db_module._AsyncSessionLocal = None

    yield

    # Restore original value and reset global engine again
    settings.DATABASE_URL = original_value
    db_module._async_engine = None
    db_module._AsyncSessionLocal = None


@pytest_asyncio.fixture(scope="session")
async def async_engine(pglite: SQLAlchemyAsyncPGliteManager) -> AsyncGenerator[AsyncEngine]:
    """
    Initializes the async engine for tests and makes it the global engine.
    """
    test_engine = pglite.get_engine()

    # Make this the global engine so all code uses the same database
    import src.models.db.database as db_module  # noqa: PLC0415  # imported inside fixture to set module globals

    db_module._async_engine = test_engine
    db_module._AsyncSessionLocal = async_sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    yield test_engine


@pytest.fixture(scope="function")
def async_session_maker(async_engine):
    """
    Initializes the async session maker.
    """
    return async_sessionmaker(
        bind=async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )


@pytest_asyncio.fixture(scope="function")
async def db_session(async_session_maker):
    """
    Provides a clean session for each test.
    """
    async with async_session_maker() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture(autouse=True, scope="function")
async def db_schema(async_engine):
    """
    Initializes the database schema using the test database engine.
    """
    # Use the test engine passed as parameter, not the production engine
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture(name="client")
def client_fixture(db_session):
    """Fixture for unit tests - overrides database session (services can be mocked)."""

    def get_session_override():
        yield db_session

    app.dependency_overrides[get_db_session] = get_session_override

    client = AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    )
    yield client

    app.dependency_overrides.clear()


@pytest.fixture(name="integration_client")
def integration_client_fixture(db_session):
    """Fixture for integration tests - uses real database (no mocks)."""

    def get_session_override():
        yield db_session

    app.dependency_overrides[get_db_session] = get_session_override

    client = AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    )
    yield client

    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def seed_base_data(db_session: AsyncSession) -> AsyncGenerator:
    """
    Seed the database with base data needed for tests.
    """
    project_type = ProjectType(
        id=uuid.UUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380001"),
        name=DEFAULT_PROJECT_TYPE_NAME,
    )
    db_session.add(project_type)

    open_status = ProjectStatus(
        id=uuid.UUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380002"),
        name="Offen",
        internal_name="OPEN",
    )
    in_progress_status = ProjectStatus(
        id=uuid.UUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380003"),
        name="In Bearbeitung",
        internal_name="IN_PROGRESS",
    )
    in_creation_status = ProjectStatus(
        id=uuid.UUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380004"),
        name="In Erstellung",
        internal_name="IN_CREATION",
    )
    completed_status = ProjectStatus(
        id=uuid.UUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380006"),
        name="Abgeschlossen",
        internal_name="COMPLETED",
    )
    db_session.add(open_status)
    db_session.add(in_progress_status)
    db_session.add(in_creation_status)
    db_session.add(completed_status)

    process_step = ProcessStep(
        id=uuid.UUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380005"),
        name="Formale Vollständigkeitsprüfung",
        project_type_id=project_type.id,
        process_step_index=0,
    )
    db_session.add(process_step)

    await db_session.commit()
    yield


@pytest_asyncio.fixture(scope="function")
async def create_test_project(db_session: AsyncSession, seed_base_data) -> Project:
    """
    Create a test project for testing.
    """
    project_id = uuid.UUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380010")
    original_created_at = datetime.now(UTC)

    # Create project first to get its id for child records
    project = Project(
        id=project_id,
        name="Test Project",
        project_type_id=uuid.UUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380001"),
        status_id=uuid.UUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380002"),
        created_by_id=uuid.uuid4(),
        entry_date=date.today(),
        internal_project_number=f"TEST-{uuid.uuid4()}",
        current_process_step_id=uuid.UUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380005"),
        original_created_at=original_created_at,
    )
    db_session.add(project)
    await db_session.flush()

    # Create optional applicant (NodeBase — needs project_id)
    applicant = Applicant(
        project_id=project_id,
        salutation="Herr",
        company="Test Company",
        first_name="John",
        last_name="Doe",
        street="Test Street",
        house_number="123",
        plz="12345",
        location="Test Location",
        country="Germany",
        email="test@example.com",
        phone="1234567890",
    )
    db_session.add(applicant)
    await db_session.flush()
    project.applicant_id = applicant.id

    await db_session.commit()
    await db_session.refresh(project)

    return project


@pytest_asyncio.fixture(scope="function")
async def create_test_deadline(db_session: AsyncSession, create_test_project) -> Deadline:
    """
    Create a test deadline for testing.
    """
    deadline_id = uuid.UUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380030")
    deadline = Deadline(
        id=deadline_id,
        project_id=create_test_project.id,
        start_at=date(2025, 1, 1),
        end_at=date(2025, 12, 31),
        deadline_type="Frist",
        legal_basis="§ 5 Absatz 1 Satz 2 BGB",
    )
    db_session.add(deadline)
    await db_session.commit()
    await db_session.refresh(deadline)

    return deadline


@pytest.fixture
def project_type_id(create_test_project) -> UUID:
    return create_test_project.project_type_id


@pytest.fixture
def project_id(create_test_project) -> UUID:
    return create_test_project.id


@pytest.fixture
async def created_topic(client: AsyncClient, create_test_project: Project) -> TopicResponse:
    """Create one topic for many tests to reuse."""
    payload = CreateTopicRequest(
        project_id=create_test_project.id,
        name="Test Topic A",
        description="Integration test topic",
    )
    response = await client.post(
        "/topics",
        json=payload.model_dump(mode="json"),
    )
    assert response.status_code == status.HTTP_201_CREATED
    return TopicResponse(**response.json())
