"""make beteiligung_typ nullable to support unknown filename prefixes

Revision ID: f2a4b6c8d0e2
Revises: c9d8e7f6a5b4
Create Date: 2026-05-19 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f2a4b6c8d0e2"
down_revision: str | Sequence[str] | None = "c9d8e7f6a5b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "beteiligungs_eingang",
        "beteiligung_typ",
        existing_type=postgresql.ENUM(
            "stellungnahme",
            "naturschutz",
            "einwendung",
            name="beteiligungtyp",
        ),
        nullable=True,
    )
    op.alter_column(
        "beteiligungs_eingang_history",
        "beteiligung_typ",
        existing_type=postgresql.ENUM(
            "stellungnahme",
            "naturschutz",
            "einwendung",
            name="beteiligungtyp",
        ),
        nullable=True,
    )


def downgrade() -> None:
    op.execute("UPDATE beteiligungs_eingang SET beteiligung_typ = 'einwendung' WHERE beteiligung_typ IS NULL")
    op.execute("UPDATE beteiligungs_eingang_history SET beteiligung_typ = 'einwendung' WHERE beteiligung_typ IS NULL")
    op.alter_column(
        "beteiligungs_eingang",
        "beteiligung_typ",
        existing_type=postgresql.ENUM(
            "stellungnahme",
            "naturschutz",
            "einwendung",
            name="beteiligungtyp",
        ),
        nullable=False,
    )
    op.alter_column(
        "beteiligungs_eingang_history",
        "beteiligung_typ",
        existing_type=postgresql.ENUM(
            "stellungnahme",
            "naturschutz",
            "einwendung",
            name="beteiligungtyp",
        ),
        nullable=False,
    )
