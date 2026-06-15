import alembic.config


def run_alembic_upgrade() -> None:
    """Apply all pending Alembic migrations. Propagates alembic errors on failure."""
    alembic_args = [
        "--raiseerr",
        "upgrade",
        "head",
    ]
    alembic.config.main(argv=alembic_args)
