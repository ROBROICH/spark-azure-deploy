"""drop project status constraint

Revision ID: a167c582a912
Revises: b9fec1884aa8
Create Date: 2026-04-08 17:48:32.077190

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a167c582a912"
down_revision: str | Sequence[str] | None = "b9fec1884aa8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade():
    op.drop_constraint(
        "ck_project_status_internal_name",
        "project_status",
        type_="check",
    )


def downgrade():
    op.create_check_constraint(
        "ck_project_status_internal_name",
        "project_status",
        "internal_name IN ('OPEN', 'IN_PROGRESS', 'IN_CREATION', 'COMPLETED')",
    )
