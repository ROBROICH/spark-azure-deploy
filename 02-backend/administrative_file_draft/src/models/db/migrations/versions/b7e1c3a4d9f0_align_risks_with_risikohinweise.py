"""align risks with risikohinweise

Revision ID: b7e1c3a4d9f0
Revises: 76fbed3b242f, 0262207a0822
Create Date: 2026-05-13 16:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b7e1c3a4d9f0"
down_revision: str | Sequence[str] | None = ("76fbed3b242f", "0262207a0822")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()

    bind.execute(sa.text("DELETE FROM risks WHERE vae_node_id IS NULL AND is_deleted IS TRUE"))

    orphaned_risk_count = bind.execute(sa.text("SELECT COUNT(*) FROM risks WHERE vae_node_id IS NULL")).scalar_one()
    if orphaned_risk_count:
        raise RuntimeError(
            f"Cannot require risks.vae_node_id while {orphaned_risk_count} existing risk rows are orphaned."
        )

    op.alter_column(
        "risks",
        "severity",
        existing_type=postgresql.ENUM("HIGH", "MEDIUM", "LOW", name="severity_enum"),
        type_=sa.Integer(),
        postgresql_using=("CASE severity::text WHEN 'LOW' THEN 2 WHEN 'MEDIUM' THEN 5 WHEN 'HIGH' THEN 8 END"),
        existing_nullable=False,
    )
    op.create_check_constraint("ck_risks_severity_range", "risks", "severity >= 1 AND severity <= 10")
    op.alter_column("risks_history", "category", existing_type=sa.Text(), nullable=True)
    op.drop_column("risks", "category")
    op.alter_column("risks", "vae_node_id", existing_type=sa.UUID(), nullable=False)

    op.alter_column(
        "risks_history",
        "severity",
        existing_type=postgresql.ENUM("HIGH", "MEDIUM", "LOW", name="severity_enum"),
        type_=sa.Integer(),
        postgresql_using=("CASE severity::text WHEN 'LOW' THEN 2 WHEN 'MEDIUM' THEN 5 WHEN 'HIGH' THEN 8 END"),
        existing_nullable=True,
    )

    severity_enum = postgresql.ENUM("HIGH", "MEDIUM", "LOW", name="severity_enum")
    severity_enum.drop(bind, checkfirst=True)


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    severity_enum = postgresql.ENUM("HIGH", "MEDIUM", "LOW", name="severity_enum")
    severity_enum.create(bind, checkfirst=True)

    op.alter_column(
        "risks_history",
        "severity",
        existing_type=sa.Integer(),
        type_=severity_enum,
        postgresql_using=(
            "CASE "
            "WHEN severity <= 3 THEN 'LOW'::severity_enum "
            "WHEN severity <= 6 THEN 'MEDIUM'::severity_enum "
            "ELSE 'HIGH'::severity_enum "
            "END"
        ),
        existing_nullable=True,
    )

    op.alter_column("risks", "vae_node_id", existing_type=sa.UUID(), nullable=True)
    op.add_column("risks", sa.Column("category", sa.Text(), nullable=True))
    op.execute("UPDATE risks SET category = 'legacy' WHERE category IS NULL")
    op.alter_column("risks", "category", existing_type=sa.Text(), nullable=False)
    op.drop_constraint("ck_risks_severity_range", "risks", type_="check")
    op.alter_column(
        "risks",
        "severity",
        existing_type=sa.Integer(),
        type_=severity_enum,
        postgresql_using=(
            "CASE "
            "WHEN severity <= 3 THEN 'LOW'::severity_enum "
            "WHEN severity <= 6 THEN 'MEDIUM'::severity_enum "
            "ELSE 'HIGH'::severity_enum "
            "END"
        ),
        existing_nullable=False,
    )
