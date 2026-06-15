"""normalize argument status enum label

Revision ID: 9c2d1f0a4b6e
Revises: c1d2e3f4a5b6
Create Date: 2026-05-09 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

revision: str = "9c2d1f0a4b6e"
down_revision: str | Sequence[str] | None = "c1d2e3f4a5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM pg_enum e
                    JOIN pg_type t ON t.oid = e.enumtypid
                    WHERE t.typname = 'argumentstatus'
                      AND e.enumlabel = 'subtopicReviewed'
                ) AND NOT EXISTS (
                    SELECT 1
                    FROM pg_enum e
                    JOIN pg_type t ON t.oid = e.enumtypid
                    WHERE t.typname = 'argumentstatus'
                      AND e.enumlabel = 'subtopic_reviewed'
                ) THEN
                    ALTER TYPE argumentstatus RENAME VALUE 'subtopicReviewed' TO 'subtopic_reviewed';
                ELSIF EXISTS (
                    SELECT 1
                    FROM pg_enum e
                    JOIN pg_type t ON t.oid = e.enumtypid
                    WHERE t.typname = 'argumentstatus'
                      AND e.enumlabel = 'subtopicReviewed'
                ) THEN
                    UPDATE argument
                    SET status = 'subtopic_reviewed'
                    WHERE status = 'subtopicReviewed';
                    UPDATE argument_history
                    SET status = 'subtopic_reviewed'
                    WHERE status = 'subtopicReviewed';
                END IF;
            END $$;
            """
        )
    else:
        op.execute("UPDATE argument SET status = 'subtopic_reviewed' WHERE status = 'subtopicReviewed'")
        op.execute("UPDATE argument_history SET status = 'subtopic_reviewed' WHERE status = 'subtopicReviewed'")


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM pg_enum e
                    JOIN pg_type t ON t.oid = e.enumtypid
                    WHERE t.typname = 'argumentstatus'
                      AND e.enumlabel = 'subtopic_reviewed'
                ) AND NOT EXISTS (
                    SELECT 1
                    FROM pg_enum e
                    JOIN pg_type t ON t.oid = e.enumtypid
                    WHERE t.typname = 'argumentstatus'
                      AND e.enumlabel = 'subtopicReviewed'
                ) THEN
                    ALTER TYPE argumentstatus RENAME VALUE 'subtopic_reviewed' TO 'subtopicReviewed';
                ELSIF EXISTS (
                    SELECT 1
                    FROM pg_enum e
                    JOIN pg_type t ON t.oid = e.enumtypid
                    WHERE t.typname = 'argumentstatus'
                      AND e.enumlabel = 'subtopic_reviewed'
                ) THEN
                    UPDATE argument
                    SET status = 'subtopicReviewed'
                    WHERE status = 'subtopic_reviewed';
                    UPDATE argument_history
                    SET status = 'subtopicReviewed'
                    WHERE status = 'subtopic_reviewed';
                END IF;
            END $$;
            """
        )
    else:
        op.execute("UPDATE argument SET status = 'subtopicReviewed' WHERE status = 'subtopic_reviewed'")
        op.execute("UPDATE argument_history SET status = 'subtopicReviewed' WHERE status = 'subtopic_reviewed'")
