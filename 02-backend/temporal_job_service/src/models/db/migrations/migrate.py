"""Wrapper for invoking Alembic from application startup."""

import alembic.config


def run_alembic_upgrade() -> None:
    """Apply all pending migrations. Raises if any migration fails."""
    alembic.config.main(argv=["--raiseerr", "upgrade", "head"])


def run_alembic_downgrade() -> None:
    """Downgrade all migrations to base. Raises if any migration fails."""
    alembic.config.main(argv=["--raiseerr", "downgrade", "base"])
