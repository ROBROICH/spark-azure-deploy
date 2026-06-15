"""enforce unique gesetz and norm business keys

Revision ID: 7c4ea8b7d5f1
Revises: 2104f983d87d
Create Date: 2026-04-14 14:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7c4ea8b7d5f1"
down_revision: str | Sequence[str] | None = "2104f983d87d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(
        sa.text(
            """
            CREATE TEMP TABLE gesetz_group_map ON COMMIT DROP AS
            WITH ranked AS (
                SELECT
                    id,
                    first_value(id) OVER (
                        PARTITION BY project_id, jurabk
                        ORDER BY created_at, id
                    ) AS survivor_id
                FROM gesetz
                WHERE is_deleted IS false
            )
            SELECT id, survivor_id
            FROM ranked
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE gesetz AS survivor
            SET frontend_parent_ids = merged.frontend_parent_ids,
                updated_at = now()
            FROM (
                SELECT
                    group_map.survivor_id,
                    COALESCE(
                        array_agg(DISTINCT parent_id ORDER BY parent_id) FILTER (WHERE parent_id IS NOT NULL),
                        ARRAY[]::varchar[]
                    ) AS frontend_parent_ids
                FROM gesetz_group_map AS group_map
                JOIN gesetz AS member ON member.id = group_map.id
                LEFT JOIN LATERAL unnest(member.frontend_parent_ids) AS parent_id ON TRUE
                GROUP BY group_map.survivor_id
            ) AS merged
            WHERE survivor.id = merged.survivor_id
              AND survivor.frontend_parent_ids IS DISTINCT FROM merged.frontend_parent_ids
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE standangabe AS target
            SET gesetz_id = group_map.survivor_id,
                updated_at = now()
            FROM gesetz_group_map AS group_map
            WHERE group_map.id <> group_map.survivor_id
              AND target.gesetz_id = group_map.id
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE norm AS target
            SET gesetz_id = group_map.survivor_id,
                updated_at = now()
            FROM gesetz_group_map AS group_map
            WHERE group_map.id <> group_map.survivor_id
              AND target.gesetz_id = group_map.id
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE fundstelle AS target
            SET gesetz_id = group_map.survivor_id,
                updated_at = now()
            FROM gesetz_group_map AS group_map
            WHERE group_map.id <> group_map.survivor_id
              AND target.gesetz_id = group_map.id
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE gesetz AS duplicate
            SET is_deleted = true,
                updated_at = now()
            FROM gesetz_group_map AS group_map
            WHERE group_map.id <> group_map.survivor_id
              AND duplicate.id = group_map.id
            """
        )
    )

    op.execute(
        sa.text(
            """
            CREATE TEMP TABLE norm_group_map ON COMMIT DROP AS
            WITH ranked AS (
                SELECT
                    id,
                    first_value(id) OVER (
                        PARTITION BY project_id, gesetz_id, paragraph_nr
                        ORDER BY created_at, id
                    ) AS survivor_id
                FROM norm
                WHERE is_deleted IS false
            )
            SELECT id, survivor_id
            FROM ranked
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE norm AS survivor
            SET frontend_parent_ids = merged.frontend_parent_ids,
                updated_at = now()
            FROM (
                SELECT
                    group_map.survivor_id,
                    COALESCE(
                        array_agg(DISTINCT parent_id ORDER BY parent_id) FILTER (WHERE parent_id IS NOT NULL),
                        ARRAY[]::varchar[]
                    ) AS frontend_parent_ids
                FROM norm_group_map AS group_map
                JOIN norm AS member ON member.id = group_map.id
                LEFT JOIN LATERAL unnest(member.frontend_parent_ids) AS parent_id ON TRUE
                GROUP BY group_map.survivor_id
            ) AS merged
            WHERE survivor.id = merged.survivor_id
              AND survivor.frontend_parent_ids IS DISTINCT FROM merged.frontend_parent_ids
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE absatz AS target
            SET norm_id = group_map.survivor_id,
                updated_at = now()
            FROM norm_group_map AS group_map
            WHERE group_map.id <> group_map.survivor_id
              AND target.norm_id = group_map.id
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE fundstelle AS target
            SET norm_id = group_map.survivor_id,
                updated_at = now()
            FROM norm_group_map AS group_map
            WHERE group_map.id <> group_map.survivor_id
              AND target.norm_id = group_map.id
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE normvorschlag AS target
            SET norm_id = group_map.survivor_id,
                updated_at = now()
            FROM norm_group_map AS group_map
            WHERE group_map.id <> group_map.survivor_id
              AND target.norm_id = group_map.id
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE norm AS duplicate
            SET is_deleted = true,
                updated_at = now()
            FROM norm_group_map AS group_map
            WHERE group_map.id <> group_map.survivor_id
              AND duplicate.id = group_map.id
            """
        )
    )


def downgrade() -> None:
    """Downgrade schema."""
    pass
