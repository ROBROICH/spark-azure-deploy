import alembic.config


def run_alembic_upgrade() -> None:
    """Run Alembic migrations to ensure the database schema is up to date.

    Called at application startup to apply any pending migrations.
    Raises a RuntimeError if the migration fails.
    """
    alembic_args = [
        "--raiseerr",
        "upgrade",
        "head",
    ]
    alembic.config.main(argv=alembic_args)
