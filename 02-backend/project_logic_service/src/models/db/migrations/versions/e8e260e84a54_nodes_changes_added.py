"""nodes changes added

Revision ID: e8e260e84a54
Revises: 009_refactor_topics
Create Date: 2026-04-01 04:03:07.805341

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "e8e260e84a54"
down_revision: str | Sequence[str] | None = "009_refactor_topics"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    updatetype_enum = sa.Enum("AUTOMATED", "MANUAL", name="updatetype")
    updatetype_enum.create(op.get_bind(), checkfirst=True)

    op.add_column("applicant", sa.Column("project_id", sa.UUID(), nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE applicant AS a
            SET project_id = p.id
            FROM project AS p
            WHERE p.applicant_id = a.id
            """
        )
    )
    op.execute(sa.text("DELETE FROM applicant WHERE project_id IS NULL"))
    op.alter_column("applicant", "project_id", existing_type=sa.UUID(), nullable=False)
    op.add_column("applicant", sa.Column("is_deleted", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column(
        "applicant",
        sa.Column(
            "frontend_parent_ids",
            postgresql.ARRAY(sa.String()),
            server_default=sa.text("ARRAY[]::varchar[]"),
            nullable=False,
        ),
    )
    op.add_column(
        "applicant",
        sa.Column(
            "update_type",
            sa.Enum("AUTOMATED", "MANUAL", name="updatetype", create_constraint=True),
            nullable=True,
        ),
    )
    op.create_index(op.f("ix_applicant_project_id"), "applicant", ["project_id"], unique=False)
    op.create_index(
        "ix_applicant_project_id_active",
        "applicant",
        ["project_id"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.add_column("deadline", sa.Column("is_deleted", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column(
        "deadline",
        sa.Column(
            "frontend_parent_ids",
            postgresql.ARRAY(sa.String()),
            server_default=sa.text("ARRAY[]::varchar[]"),
            nullable=False,
        ),
    )
    op.add_column(
        "deadline",
        sa.Column(
            "update_type",
            sa.Enum("AUTOMATED", "MANUAL", name="updatetype", create_constraint=True),
            nullable=True,
        ),
    )
    op.alter_column("deadline", "project_id", existing_type=sa.UUID(), nullable=False)
    op.create_index(
        "ix_deadline_project_id_active",
        "deadline",
        ["project_id"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.add_column("process_step", sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("process_step", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE process_step
            SET created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE created_at IS NULL OR updated_at IS NULL
            """
        )
    )
    op.alter_column("process_step", "created_at", existing_type=sa.DateTime(timezone=True), nullable=False)
    op.alter_column("process_step", "updated_at", existing_type=sa.DateTime(timezone=True), nullable=False)
    op.add_column("project_status", sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("project_status", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE project_status
            SET created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE created_at IS NULL OR updated_at IS NULL
            """
        )
    )
    op.alter_column("project_status", "created_at", existing_type=sa.DateTime(timezone=True), nullable=False)
    op.alter_column("project_status", "updated_at", existing_type=sa.DateTime(timezone=True), nullable=False)
    op.add_column(
        "project_topic", sa.Column("is_deleted", sa.Boolean(), server_default=sa.text("false"), nullable=False)
    )
    op.add_column(
        "project_topic",
        sa.Column(
            "frontend_parent_ids",
            postgresql.ARRAY(sa.String()),
            server_default=sa.text("ARRAY[]::varchar[]"),
            nullable=False,
        ),
    )
    op.add_column(
        "project_topic",
        sa.Column(
            "update_type",
            sa.Enum("AUTOMATED", "MANUAL", name="updatetype", create_constraint=True),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_project_topic_project_id_active",
        "project_topic",
        ["project_id"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.add_column("project_type", sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("project_type", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE project_type
            SET created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE created_at IS NULL OR updated_at IS NULL
            """
        )
    )
    op.alter_column("project_type", "created_at", existing_type=sa.DateTime(timezone=True), nullable=False)
    op.alter_column("project_type", "updated_at", existing_type=sa.DateTime(timezone=True), nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_column("project_type", "updated_at")
    op.drop_column("project_type", "created_at")
    op.drop_index(
        "ix_project_topic_project_id_active",
        table_name="project_topic",
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.drop_column("project_topic", "update_type")
    op.drop_column("project_topic", "frontend_parent_ids")
    op.drop_column("project_topic", "is_deleted")
    op.drop_column("project_status", "updated_at")
    op.drop_column("project_status", "created_at")
    op.drop_column("process_step", "updated_at")
    op.drop_column("process_step", "created_at")
    op.drop_index(
        "ix_deadline_project_id_active", table_name="deadline", postgresql_where=sa.text("is_deleted IS false")
    )
    op.alter_column("deadline", "project_id", existing_type=sa.UUID(), nullable=True)
    op.drop_column("deadline", "update_type")
    op.drop_column("deadline", "frontend_parent_ids")
    op.drop_column("deadline", "is_deleted")
    op.drop_index(
        "ix_applicant_project_id_active", table_name="applicant", postgresql_where=sa.text("is_deleted IS false")
    )
    op.drop_index(op.f("ix_applicant_project_id"), table_name="applicant")
    op.drop_column("applicant", "update_type")
    op.drop_column("applicant", "frontend_parent_ids")
    op.drop_column("applicant", "is_deleted")
    op.drop_column("applicant", "project_id")

    sa.Enum(name="updatetype").drop(op.get_bind(), checkfirst=True)
    # ### end Alembic commands ###
