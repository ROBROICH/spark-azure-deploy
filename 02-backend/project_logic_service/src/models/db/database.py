"""Database connection and session management."""

from collections.abc import AsyncGenerator
from typing import Any

from event_logging import setup_db_logging
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from src.config.settings import settings

# Lazy initialization - only create engine when needed
_async_engine: AsyncEngine | None = None
_AsyncSessionLocal: async_sessionmaker[AsyncSession] | None = None


def _get_database_url() -> str:
    """Get database URL from settings.

    Raises:
        ValueError: If DATABASE_URL is not configured. For testing, override
            settings.DATABASE_URL in your test fixtures.
    """
    if not settings.DATABASE_URL:
        raise ValueError("DATABASE_URL must be set. For testing, override settings.DATABASE_URL in your test fixtures.")
    return settings.DATABASE_URL


def _init_engine() -> None:
    """Initialize the async engine and session maker."""
    global _async_engine, _AsyncSessionLocal
    if _async_engine is None:
        database_url = _get_database_url()

        engine_kwargs: dict[str, Any] = {"echo": False}
        if "postgresql" in database_url or "postgres" in database_url:
            engine_kwargs.update(
                {
                    "pool_size": 5,
                    "max_overflow": 10,
                    "pool_timeout": 30,
                    "pool_recycle": 1800,
                    "pool_pre_ping": True,
                }
            )

        _async_engine = create_async_engine(database_url, **engine_kwargs)
        if "postgresql" in database_url or "postgres" in database_url:
            setup_db_logging(_async_engine, service_name=settings.SERVICE_NAME)
        _AsyncSessionLocal = async_sessionmaker(
            bind=_async_engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )


# Initialize on first access
def __getattr__(name: str) -> Any:
    """Lazy attribute access for backward compatibility."""
    if name == "async_engine":
        _init_engine()
        return _async_engine
    if name == "AsyncSessionLocal":
        _init_engine()
        return _AsyncSessionLocal
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


async def get_db_session() -> AsyncGenerator[AsyncSession | Any, Any]:
    """Yields the async database session."""
    _init_engine()
    async with _AsyncSessionLocal() as session:  # type: ignore[misc]
        yield session
