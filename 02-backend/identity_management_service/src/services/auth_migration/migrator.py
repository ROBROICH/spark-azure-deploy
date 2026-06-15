import importlib.util
from pathlib import Path
from types import ModuleType

from authentification.auth import AuthClient
from event_logging import EventAction, EventCategory, EventOutcome
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio.session import AsyncSession
from sqlalchemy.sql.expression import text

from src.models.db_models import SpiceDBMigration
from src.utils.logger import logger

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


class SpiceDBMigrator:
    lock_id: int = 9483721

    def __init__(self, client: AuthClient, db: AsyncSession) -> None:
        self.db = db
        self.client = client

    @staticmethod
    async def _load_modules() -> list[ModuleType]:
        files = sorted(MIGRATIONS_DIR.glob("*.py"))
        modules: list[ModuleType] = []

        for file in files:
            spec = importlib.util.spec_from_file_location(file.stem, file)
            if spec is None or spec.loader is None:
                raise ImportError(f"Could not load SpiceDB migration module from {file}")
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            modules.append(module)

        return modules

    async def _acquire_migration_lock(self) -> None:
        """Acquire a lock on the migration table."""
        await self.db.execute(
            text("SELECT pg_advisory_xact_lock(:id)"),
            {"id": self.lock_id},
        )

    async def current_versions(self) -> set[str]:
        """Gets the current applied version."""
        result = await self.db.execute(select(SpiceDBMigration))
        rows = result.scalars().all()
        return {row.version for row in rows}

    async def mark_applied(self, version: str) -> None:
        """Mark version as applied."""
        stmt = insert(SpiceDBMigration).values(version=version).on_conflict_do_nothing(index_elements=["version"])
        await self.db.execute(stmt)
        await self.db.flush()

    async def upgrade(self) -> None:
        """Runs all migrations."""
        await self._acquire_migration_lock()

        try:
            applied = await self.current_versions()

            for migration in await self._load_modules():
                if migration.revision in applied:
                    continue

                logger.info(
                    action=EventAction.HEALTH,
                    outcome=EventOutcome.UNKNOWN,
                    category=EventCategory.AUTHENTICATION,
                    message=f"SPICE-DB MIGRATION: Applying {migration.revision}",
                )

                await migration.upgrade(client=self.client)

                await self.mark_applied(migration.revision)

                logger.info(
                    action=EventAction.HEALTH,
                    outcome=EventOutcome.SUCCESS,
                    category=EventCategory.AUTHENTICATION,
                    message=f"SPICE-DB MIGRATION: Successfully applied {migration.revision}",
                )

            await self.db.commit()

        except Exception:
            await self.db.rollback()
            raise
