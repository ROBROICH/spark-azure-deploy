"""add topic visibility and subtopics

Revision ID: d4f0a9c8e1b2
Revises: 6b5f0068c334
Create Date: 2026-05-15 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "d4f0a9c8e1b2"
down_revision: str | Sequence[str] | None = "6b5f0068c334"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_UPDATE_TYPE_ENUM = postgresql.ENUM("AUTOMATED", "MANUAL", name="updatetype", create_type=False)


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "topic",
        sa.Column("show_in_ewm", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "topic",
        sa.Column("show_in_beschluss", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "topic_history",
        sa.Column("show_in_ewm", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "topic_history",
        sa.Column("show_in_beschluss", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.create_table(
        "subtopic",
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("topic_id", sa.UUID(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "frontend_parent_ids",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("ARRAY[]::varchar[]"),
        ),
        sa.Column(
            "update_type",
            _UPDATE_TYPE_ENUM,
            nullable=True,
            server_default=sa.text("'AUTOMATED'::updatetype"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("show_in_mvp", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("show_in_ewm", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("show_in_beschluss", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column(
            "sys_period",
            postgresql.TSTZRANGE(),
            server_default=sa.text("tstzrange(current_timestamp, null)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["project.id"],
            name="fk_subtopic_project_id_project",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["topic_id"],
            ["topic.id"],
            name="fk_subtopic_topic_id_topic",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_subtopic_project_id"), "subtopic", ["project_id"], unique=False)
    op.create_index(
        "ix_subtopic_project_id_active",
        "subtopic",
        ["project_id"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.create_index(op.f("ix_subtopic_topic_id"), "subtopic", ["topic_id"], unique=False)
    op.create_index(
        "uq_subtopic_topic_name_active",
        "subtopic",
        ["topic_id", "name"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.execute("CREATE TABLE subtopic_history (LIKE subtopic EXCLUDING ALL)")
    op.execute("CREATE INDEX ON subtopic_history (sys_period)")
    op.execute("CREATE INDEX ON subtopic_history (id)")
    op.execute(
        "CREATE TRIGGER versioning_trigger BEFORE INSERT OR UPDATE OR DELETE ON subtopic "
        "FOR EACH ROW EXECUTE PROCEDURE versioning('sys_period', 'subtopic_history', true)"
    )

    op.add_column("topic_norm", sa.Column("subtopic_id", sa.UUID(), nullable=True))
    op.add_column("topic_norm_history", sa.Column("subtopic_id", sa.UUID(), nullable=True))
    op.create_index(op.f("ix_topic_norm_subtopic_id"), "topic_norm", ["subtopic_id"], unique=False)
    op.create_foreign_key(
        "fk_topic_norm_subtopic_id_subtopic",
        "topic_norm",
        "subtopic",
        ["subtopic_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.alter_column("topic_norm", "topic_id", existing_type=sa.UUID(), nullable=True)
    op.alter_column("topic_norm_history", "topic_id", existing_type=sa.UUID(), nullable=True)

    op.drop_index("uq_topic_norm", table_name="topic_norm", postgresql_where=sa.text("is_deleted IS false"))
    op.create_index(
        "uq_topic_norm",
        "topic_norm",
        ["topic_id", "jurabk", "paragraph_nr", "satz", "absatz", "nummer"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false AND topic_id IS NOT NULL"),
    )
    op.create_index(
        "uq_subtopic_norm",
        "topic_norm",
        ["subtopic_id", "jurabk", "paragraph_nr", "satz", "absatz", "nummer"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false AND subtopic_id IS NOT NULL"),
    )
    op.create_check_constraint(
        "ck_topic_norm_exactly_one_owner",
        "topic_norm",
        "(topic_id IS NOT NULL AND subtopic_id IS NULL) OR (topic_id IS NULL AND subtopic_id IS NOT NULL)",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("ck_topic_norm_exactly_one_owner", "topic_norm", type_="check")
    op.drop_index(
        "uq_subtopic_norm",
        table_name="topic_norm",
        postgresql_where=sa.text("is_deleted IS false AND subtopic_id IS NOT NULL"),
    )
    op.drop_index(
        "uq_topic_norm",
        table_name="topic_norm",
        postgresql_where=sa.text("is_deleted IS false AND topic_id IS NOT NULL"),
    )
    op.create_index(
        "uq_topic_norm",
        "topic_norm",
        ["topic_id", "jurabk", "paragraph_nr", "satz", "absatz", "nummer"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false"),
    )

    op.execute("DELETE FROM topic_norm_history WHERE subtopic_id IS NOT NULL")
    op.execute("DELETE FROM topic_norm WHERE subtopic_id IS NOT NULL")
    op.alter_column("topic_norm_history", "topic_id", existing_type=sa.UUID(), nullable=False)
    op.alter_column("topic_norm", "topic_id", existing_type=sa.UUID(), nullable=False)
    op.drop_constraint("fk_topic_norm_subtopic_id_subtopic", "topic_norm", type_="foreignkey")
    op.drop_index(op.f("ix_topic_norm_subtopic_id"), table_name="topic_norm")
    op.drop_column("topic_norm_history", "subtopic_id")
    op.drop_column("topic_norm", "subtopic_id")

    op.execute("DROP TRIGGER IF EXISTS versioning_trigger ON subtopic")
    op.drop_table("subtopic_history")
    op.drop_table("subtopic")

    op.drop_column("topic_history", "show_in_beschluss")
    op.drop_column("topic_history", "show_in_ewm")
    op.drop_column("topic", "show_in_beschluss")
    op.drop_column("topic", "show_in_ewm")
