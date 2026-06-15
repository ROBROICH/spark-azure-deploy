import pytest
from authentification.auth import AuthClient
from authentification.dependencies import get_auth_client
from sqlalchemy.sql.expression import select

from src.models.db_models import SpiceDBMigration
from src.services.auth_migration.migrator import SpiceDBMigrator


@pytest.fixture
async def mock_client():
    client = await get_auth_client()
    yield client
    try:
        await client.delete_schema()
    except Exception as e:
        if "no schema has been defined" not in str(e):
            raise


@pytest.fixture(scope="function")
def mock_schemas() -> list:
    class Migration1:
        revision = "001"

        @staticmethod
        async def upgrade(client: AuthClient):
            schema = """
            definition user {}

            definition document {
                relation writer: user
                relation reader: user

                permission update = writer
                permission read = reader + update
            }
            """
            await client.write_schema(schema=schema)

    class Migration2:
        revision = "002"

        @staticmethod
        async def upgrade(client: AuthClient):
            schema = """
            definition user {}

            definition document {
                relation writer: user
                relation reader: user
                relation owner: user

                permission update = writer
                permission read = reader + update
                permission delete = owner
            }
            """
            await client.write_schema(schema=schema)

    return [Migration1, Migration2]


@pytest.mark.asyncio
async def test_spicedb_migrator_real_db(db_session, mock_schemas, mock_client):
    """
    Full integration test.
    """
    migrator = SpiceDBMigrator(client=mock_client, db=db_session)

    calls = [migration.revision for migration in mock_schemas]

    async def fake_load():
        return mock_schemas

    # inject fake loader
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(migrator, "_load_modules", fake_load)

    await migrator.upgrade()

    assert calls == ["001", "002"]

    result = await db_session.execute(select(SpiceDBMigration))
    rows = result.scalars().all()

    versions = {r.version for r in rows}

    assert "001" in versions
    assert "002" in versions

    schema = await mock_client.read_schema()
    schema_text = schema.schema_text.strip()
    assert "definition document" in schema_text
    assert "permission update" in schema_text
    assert "permission read" in schema_text
    assert "permission delete" in schema_text


@pytest.mark.asyncio
async def test_spicedb_migrator_is_idempotent(
    db_session,
    mock_schemas,
    mock_client,
):
    migrator = SpiceDBMigrator(client=mock_client, db=db_session)

    async def fake_load():
        return mock_schemas

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(migrator, "_load_modules", fake_load)

    await migrator.upgrade()
    await migrator.upgrade()

    result = await db_session.execute(select(SpiceDBMigration))
    rows = result.scalars().all()

    versions = [row.version for row in rows]

    assert versions.count("001") == 1
    assert versions.count("002") == 1


@pytest.mark.asyncio
async def test_spicedb_migrator_skips_applied_versions(
    db_session,
    mock_schemas,
    mock_client,
):
    db_session.add(SpiceDBMigration(version="001"))
    await db_session.commit()

    migrator = SpiceDBMigrator(client=mock_client, db=db_session)

    calls = []

    class Migration1:
        revision = "001"

        @staticmethod
        async def upgrade(client: AuthClient):
            calls.append("001")

    class Migration2:
        revision = "002"

        @staticmethod
        async def upgrade(client: AuthClient):
            calls.append("002")

    async def fake_load():
        return [Migration1, Migration2]

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(migrator, "_load_modules", fake_load)

    await migrator.upgrade()

    assert calls == ["002"]


@pytest.mark.asyncio
async def test_spicedb_migrator_failure_does_not_mark_version(
    db_session,
    mock_client,
):
    migrator = SpiceDBMigrator(client=mock_client, db=db_session)

    class BrokenMigration:
        revision = "001"

        @staticmethod
        async def upgrade(client: AuthClient):
            raise RuntimeError("migration failed")

    async def fake_load():
        return [BrokenMigration]

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(migrator, "_load_modules", fake_load)

    with pytest.raises(RuntimeError):
        await migrator.upgrade()

    result = await db_session.execute(select(SpiceDBMigration))
    rows = result.scalars().all()

    assert rows == []
