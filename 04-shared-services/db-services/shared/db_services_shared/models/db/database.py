"""Database connection and session management."""

from collections.abc import AsyncGenerator
from typing import Any

from event_logging.db_logging import setup_db_logging
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from db_services_shared.config.settings import CommonSettings

_async_engine: AsyncEngine | None = None
_async_session_factory: async_sessionmaker[AsyncSession] | None = None


def init_database(settings: CommonSettings) -> None:
    """Initialise the async engine and session factory from service-specific settings.

    Must be called once during application startup (e.g. inside ``app_factory``)
    before any request handler uses ``get_db_session``.
    """
    global _async_engine, _async_session_factory

    _async_engine = create_async_engine(
        settings.db.async_dsn,
        echo=False,
        pool_size=settings.db.pool_size,
        max_overflow=settings.db.max_overflow,
        pool_timeout=30,
        pool_recycle=1800,
        pool_pre_ping=True,
        isolation_level="READ COMMITTED",
    )

    setup_db_logging(_async_engine, service_name=settings.SERVICE_NAME)

    _async_session_factory = async_sessionmaker(
        bind=_async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )


def get_async_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return the process-wide ``async_sessionmaker``.

    Use this from non-request contexts (e.g. Temporal activities, background
    workers) where ``get_db_session``is not appropriate. Callers should open a
    session with ``async with factory() as session:`` so the connection is
    returned to the pool on exit.
    """
    if _async_session_factory is None:
        raise RuntimeError(
            "Database not initialised. Call init_database(settings) during app startup."
        )
    return _async_session_factory


async def get_db_session() -> AsyncGenerator[AsyncSession | Any, Any]:
    """Yields the async database session."""
    if _async_session_factory is None:
        raise RuntimeError(
            "Database not initialised. Call init_database(settings) during app startup."
        )
    async with _async_session_factory() as session:
        yield session
