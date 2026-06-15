from unittest.mock import AsyncMock, MagicMock

import pytest

from src.services.auth_migration.migrator import SpiceDBMigrator


class FakeMigration:
    revision = "001"

    def __init__(self):
        self.called = False

    async def upgrade(self, client):
        self.called = True


def make_scalar_result(rows=None):
    rows = rows or []

    scalar = MagicMock()
    scalar.all.return_value = rows

    result = MagicMock()
    result.scalars.return_value = scalar

    return result


@pytest.mark.asyncio
async def test_upgrade_runs_migration(monkeypatch):
    db = AsyncMock()
    client = MagicMock()

    migrator = SpiceDBMigrator(client, db)

    fake = FakeMigration()

    async def fake_load():
        return [fake]

    monkeypatch.setattr(migrator, "_load_modules", fake_load)

    db.execute.return_value = make_scalar_result([])

    await migrator.upgrade()

    assert fake.called is True
    db.commit.assert_called()


@pytest.mark.asyncio
async def test_upgrade_skips_applied(monkeypatch):
    db = AsyncMock()
    client = MagicMock()

    migrator = SpiceDBMigrator(client, db)

    fake = FakeMigration()

    async def fake_load():
        return [fake]

    monkeypatch.setattr(migrator, "_load_modules", fake_load)

    row = MagicMock()
    row.version = "001"

    db.execute.return_value = make_scalar_result([row])

    await migrator.upgrade()

    assert fake.called is False
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_transaction_scoped_lock_rolls_back_on_error(monkeypatch):
    db = AsyncMock()
    client = MagicMock()

    migrator = SpiceDBMigrator(client, db)

    async def fake_load():
        raise RuntimeError("boom")

    monkeypatch.setattr(migrator, "_load_modules", fake_load)

    db.execute.return_value = make_scalar_result([])

    with pytest.raises(RuntimeError):
        await migrator.upgrade()

    db.rollback.assert_called_once()
    lock_calls = [
        call
        for call in db.execute.call_args_list
        if str(call.args[0]) == "SELECT pg_advisory_xact_lock(:id)"
    ]
    assert len(lock_calls) == 1


@pytest.mark.asyncio
async def test_migrations_run_in_order(monkeypatch):
    db = AsyncMock()
    client = MagicMock()

    migrator = SpiceDBMigrator(client, db)

    calls = []

    class M1:
        revision = "001"

        async def upgrade(self, client):
            calls.append("001")

    class M2:
        revision = "002"

        async def upgrade(self, client):
            calls.append("002")

    async def fake_load():
        return [M1(), M2()]

    monkeypatch.setattr(migrator, "_load_modules", fake_load)

    db.execute.return_value = make_scalar_result([])

    await migrator.upgrade()

    assert calls == ["001", "002"]


@pytest.mark.asyncio
async def test_mark_applied_called(monkeypatch):
    db = AsyncMock()
    client = MagicMock()

    migrator = SpiceDBMigrator(client, db)

    class M:
        revision = "001"

        async def upgrade(self, client):
            pass

    async def fake_load():
        return [M()]

    monkeypatch.setattr(migrator, "_load_modules", fake_load)

    db.execute.return_value = make_scalar_result([])

    await migrator.upgrade()

    db.commit.assert_called_once()
