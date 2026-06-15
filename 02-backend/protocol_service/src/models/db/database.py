"""One async engine per source service, keyed by source name."""

from __future__ import annotations

from collections.abc import AsyncGenerator

from event_logging.db_logging import setup_db_logging
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from src.config.settings import SOURCE_DB_KEYS, settings


def _build_engine(url: str) -> AsyncEngine:
    return create_async_engine(
        url,
        echo=False,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_timeout=30,
        pool_recycle=1800,
        pool_pre_ping=settings.DB_POOL_PRE_PING,
    )


_engines: dict[str, AsyncEngine] = {}
_sessionmakers: dict[str, async_sessionmaker[AsyncSession]] = {}

for _key in SOURCE_DB_KEYS:
    _src = settings.source_db(_key)
    _eng = _build_engine(_src.url)
    setup_db_logging(_eng, service_name=f"{settings.SERVICE_NAME}:{_key}")
    _engines[_key] = _eng
    _sessionmakers[_key] = async_sessionmaker(bind=_eng, class_=AsyncSession, expire_on_commit=False)


def get_engine(source_key: str) -> AsyncEngine:
    """Return the async engine for a configured source. Raises if missing."""
    if source_key not in _engines:
        raise RuntimeError(f"No engine configured for source '{source_key}'. Check env vars and SOURCE_DB_KEYS.")
    return _engines[source_key]


async def session_for(source_key: str) -> AsyncGenerator[AsyncSession]:
    sm = _sessionmakers.get(source_key)
    if sm is None:
        raise RuntimeError(f"No sessionmaker configured for source '{source_key}'.")
    async with sm() as session:
        yield session


def configured_sources() -> list[str]:
    return list(_engines.keys())
