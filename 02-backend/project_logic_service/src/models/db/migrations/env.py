"""Alembic environment configuration for migrations."""

from logging.config import fileConfig

from alembic import context
from alembic_utils.temporal import build_versioning_hooks
from sqlalchemy import engine_from_config, pool
from sqlalchemy.sql.expression import text

from src.config.settings import settings
from src.models.db_models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

config.set_main_option(
    name="sqlalchemy.url",
    value=settings.DATABASE_URL.replace("+asyncpg", ""),
)


target_metadata = Base.metadata
_temporal_hooks = build_versioning_hooks(version="v1")


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        compare_server_default=True,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_name=_temporal_hooks["include_name"],
        process_revision_directives=_temporal_hooks["process_revision_directives"],
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_name=_temporal_hooks["include_name"],
            process_revision_directives=_temporal_hooks["process_revision_directives"],
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.get_context()._ensure_version_table()
            connection.execute(text("LOCK TABLE alembic_version IN ACCESS EXCLUSIVE MODE"))
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
