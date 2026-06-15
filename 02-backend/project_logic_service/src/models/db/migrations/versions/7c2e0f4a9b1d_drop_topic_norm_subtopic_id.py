"""drop topic_norm subtopic_id

Revision ID: 7c2e0f4a9b1d
Revises: 2fc45d806661
Create Date: 2026-05-16 10:40:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7c2e0f4a9b1d"
down_revision: str | Sequence[str] | None = "2fc45d806661"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint("ck_topic_norm_exactly_one_owner", "topic_norm", type_="check")
    op.drop_constraint("fk_topic_norm_subtopic_id_subtopic", "topic_norm", type_="foreignkey")
    op.execute("DROP INDEX IF EXISTS uq_subtopic_norm")
    op.execute("DROP INDEX IF EXISTS ix_topic_norm_subtopic_id")
    op.execute("DROP INDEX IF EXISTS uq_topic_norm")

    op.execute(
        """
        CREATE TEMP TABLE topic_norm_merge_groups ON COMMIT DROP AS
        SELECT
            (
                array_agg(
                    tn.id
                    ORDER BY (tn.subtopic_id IS NULL) DESC, tn.created_at NULLS LAST, tn.id::text
                )
            )[1] AS keep_id,
            array_agg(tn.id) AS row_ids,
            tn.project_version,
            COALESCE(tn.topic_id, st.topic_id) AS topic_id,
            tn.jurabk,
            tn.paragraph_nr,
            tn.satz,
            tn.absatz,
            tn.nummer,
            COALESCE(
                array_agg(DISTINCT parent_refs.parent_id)
                    FILTER (WHERE parent_refs.parent_id IS NOT NULL),
                ARRAY[]::varchar[]
            )::varchar[] AS frontend_parent_ids
        FROM topic_norm tn
        LEFT JOIN subtopic st
            ON st.id = tn.subtopic_id
            AND st.project_version = tn.project_version
        LEFT JOIN LATERAL unnest(
            COALESCE(tn.frontend_parent_ids, ARRAY[]::varchar[])
            ||
            CASE
                WHEN tn.subtopic_id IS NOT NULL
                    THEN ARRAY['subtopic:' || tn.subtopic_id::text]::varchar[]
                ELSE ARRAY[]::varchar[]
            END
        ) AS parent_refs(parent_id) ON TRUE
        WHERE tn.is_deleted IS false
            AND COALESCE(tn.topic_id, st.topic_id) IS NOT NULL
        GROUP BY
            tn.project_version,
            COALESCE(tn.topic_id, st.topic_id),
            tn.jurabk,
            tn.paragraph_nr,
            tn.satz,
            tn.absatz,
            tn.nummer
        HAVING bool_or(tn.subtopic_id IS NOT NULL) OR count(*) > 1
        """
    )

    op.execute(
        """
        UPDATE topic_norm tn
        SET
            topic_id = merge_group.topic_id,
            subtopic_id = NULL,
            frontend_parent_ids = merge_group.frontend_parent_ids
        FROM topic_norm_merge_groups merge_group
        WHERE tn.id = merge_group.keep_id
            AND tn.project_version = merge_group.project_version
        """
    )

    op.execute(
        """
        DELETE FROM topic_norm tn
        USING topic_norm_merge_groups merge_group
        WHERE tn.project_version = merge_group.project_version
            AND tn.id = ANY(merge_group.row_ids)
            AND tn.id <> merge_group.keep_id
        """
    )

    op.execute(
        """
        UPDATE topic_norm tn
        SET
            topic_id = st.topic_id,
            subtopic_id = NULL,
            frontend_parent_ids = ARRAY(
                SELECT DISTINCT parent_id
                FROM unnest(
                    COALESCE(tn.frontend_parent_ids, ARRAY[]::varchar[])
                    || ARRAY['subtopic:' || tn.subtopic_id::text]::varchar[]
                ) AS parent_id
                ORDER BY parent_id
            )::varchar[]
        FROM subtopic st
        WHERE tn.subtopic_id = st.id
            AND tn.project_version = st.project_version
        """
    )

    op.execute("SET CONSTRAINTS ALL IMMEDIATE")
    op.alter_column("topic_norm", "topic_id", existing_type=sa.UUID(), nullable=False)
    op.drop_column("topic_norm_history", "subtopic_id")
    op.drop_column("topic_norm", "subtopic_id")
    op.create_index(
        "uq_topic_norm",
        "topic_norm",
        ["topic_id", "project_version", "jurabk", "paragraph_nr", "satz", "absatz", "nummer"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP INDEX IF EXISTS uq_topic_norm")
    op.add_column("topic_norm", sa.Column("subtopic_id", sa.UUID(), nullable=True))
    op.execute("ALTER TABLE topic_norm_history ADD COLUMN subtopic_id UUID")
    op.alter_column("topic_norm", "topic_id", existing_type=sa.UUID(), nullable=True)
    op.create_foreign_key(
        "fk_topic_norm_subtopic_id_subtopic",
        "topic_norm",
        "subtopic",
        ["subtopic_id", "project_version"],
        ["id", "project_version"],
        ondelete="CASCADE",
        deferrable=True,
        initially="DEFERRED",
    )
    op.create_index(op.f("ix_topic_norm_subtopic_id"), "topic_norm", ["subtopic_id"], unique=False)
    op.create_index(
        "uq_topic_norm",
        "topic_norm",
        ["topic_id", "project_version", "jurabk", "paragraph_nr", "satz", "absatz", "nummer"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false AND topic_id IS NOT NULL"),
    )
    op.create_index(
        "uq_subtopic_norm",
        "topic_norm",
        ["subtopic_id", "project_version", "jurabk", "paragraph_nr", "satz", "absatz", "nummer"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false AND subtopic_id IS NOT NULL"),
    )
    op.create_check_constraint(
        "ck_topic_norm_exactly_one_owner",
        "topic_norm",
        "(topic_id IS NOT NULL AND subtopic_id IS NULL) OR (topic_id IS NULL AND subtopic_id IS NOT NULL)",
    )
