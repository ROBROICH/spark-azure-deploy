"""Add internal_name to project_status and refactor status set to 4 values

Revision ID: 006_project_status_internal_name
Revises: 005_pt_name_length
Create Date: 2026-03-18

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "006_project_status_internal_name"
down_revision: str | Sequence[str] | None = "005_pt_name_length"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add internal_name column and constraints; migrate internal_name for pre-existing rows."""
    # 1. Add internal_name as nullable initially
    op.add_column(
        "project_status",
        sa.Column("internal_name", sa.String(), nullable=True),
        if_not_exists=True,
    )

    # 2. Set internal_name for known statuses (for pre-existing rows)
    op.execute("UPDATE project_status SET internal_name = 'IN_CREATION' WHERE name = 'In Erstellung'")
    op.execute("UPDATE project_status SET internal_name = 'OPEN' WHERE name = 'Offen'")
    op.execute("UPDATE project_status SET internal_name = 'IN_PROGRESS' WHERE name = 'In Bearbeitung'")
    op.execute("UPDATE project_status SET internal_name = 'COMPLETED' WHERE name = 'Abgeschlossen'")

    # 3. Re-point any projects referencing APPROVED or REJECTED to COMPLETED
    op.execute(
        """
        UPDATE project
        SET status_id = (
            SELECT id FROM project_status WHERE internal_name = 'COMPLETED'
        )
        WHERE status_id IN (
            SELECT id FROM project_status WHERE name IN ('Genehmigt', 'Abgelehnt')
        )
        """
    )

    # 4. Delete the old APPROVED and REJECTED statuses
    op.execute("DELETE FROM project_status WHERE name IN ('Genehmigt', 'Abgelehnt')")

    # 5. Make internal_name NOT NULL
    op.alter_column(
        "project_status",
        "internal_name",
        existing_type=sa.String(),
        nullable=False,
    )

    # 6. Add UNIQUE constraint (idempotent — guard against partial prior runs)
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'uq_project_status_internal_name'
                AND conrelid = 'project_status'::regclass
            ) THEN
                ALTER TABLE project_status
                    ADD CONSTRAINT uq_project_status_internal_name UNIQUE (internal_name);
            END IF;
        END $$;
        """
    )

    # 7. Add CHECK constraint to restrict to allowed values (idempotent)
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'ck_project_status_internal_name'
                AND conrelid = 'project_status'::regclass
            ) THEN
                ALTER TABLE project_status
                    ADD CONSTRAINT ck_project_status_internal_name
                    CHECK (internal_name IN ('IN_CREATION', 'OPEN', 'IN_PROGRESS', 'COMPLETED'));
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    """Remove internal_name column and restore the original 5-status set."""
    # 1. Drop CHECK constraint
    op.drop_constraint(
        "ck_project_status_internal_name",
        "project_status",
        type_="check",
    )

    # 2. Drop UNIQUE constraint
    op.drop_constraint(
        "uq_project_status_internal_name",
        "project_status",
        type_="unique",
    )

    # 3. Make internal_name nullable BEFORE inserting rows without it
    op.alter_column(
        "project_status",
        "internal_name",
        existing_type=sa.String(),
        nullable=True,
    )

    # 4. Re-insert old APPROVED and REJECTED statuses (internal_name left NULL)
    op.execute("INSERT INTO project_status (id, name) VALUES (gen_random_uuid(), 'Genehmigt')")
    op.execute("INSERT INTO project_status (id, name) VALUES (gen_random_uuid(), 'Abgelehnt')")

    # 5. Drop internal_name column
    op.drop_column("project_status", "internal_name")
