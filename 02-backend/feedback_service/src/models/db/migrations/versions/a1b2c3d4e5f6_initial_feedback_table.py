"""initial feedback table

Revision ID: a1b2c3d4e5f6
Revises:
Create Date: 2026-05-11 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from alembic_utils.temporal import (
    install_versioning_function,
    setup_versioning_for_table,
    teardown_versioning_for_table,
    uninstall_versioning_function,
)
from sqlalchemy.dialects import postgresql

revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    updatetype_enum = postgresql.ENUM("AUTOMATED", "MANUAL", name="updatetype")
    updatetype_enum.create(op.get_bind(), checkfirst=True)
    feedbackrating_enum = postgresql.ENUM("POSITIVE", "NEGATIVE", name="feedbackrating")
    feedbackrating_enum.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "feedback",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "frontend_parent_ids",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("ARRAY[]::varchar[]"),
        ),
        sa.Column(
            "update_type",
            postgresql.ENUM("AUTOMATED", "MANUAL", name="updatetype", create_type=False),
            nullable=True,
            server_default="AUTOMATED",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "sys_period", postgresql.TSTZRANGE(), nullable=False, server_default=sa.text("tstzrange(now(), null)")
        ),
        sa.Column(
            "rating", postgresql.ENUM("POSITIVE", "NEGATIVE", name="feedbackrating", create_type=False), nullable=False
        ),
        sa.Column("reason", sa.String(length=30), nullable=True),
        sa.Column("text", sa.String(length=5000), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_feedback_project_id", "feedback", ["project_id"])
    op.create_index(
        "ix_feedback_project_id_active",
        "feedback",
        ["project_id"],
        postgresql_where=sa.text("is_deleted IS false"),
    )
    install_versioning_function(op, version="v1")
    setup_versioning_for_table(op, "feedback")


def downgrade() -> None:
    teardown_versioning_for_table(op, "feedback")
    uninstall_versioning_function(op)
    op.drop_index("ix_feedback_project_id_active", table_name="feedback")
    op.drop_index("ix_feedback_project_id", table_name="feedback")
    op.drop_table("feedback")
    sa.Enum(name="feedbackrating").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="updatetype").drop(op.get_bind(), checkfirst=True)
