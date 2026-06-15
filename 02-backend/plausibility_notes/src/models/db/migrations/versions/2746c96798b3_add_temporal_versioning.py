"""add temporal versioning for all existing tables

Revision ID: 2746c96798b3
Revises: 3d58b28e50a3
Create Date: 2026-04-23 11:43:01.717452

"""

from collections.abc import Sequence

from alembic import op
from alembic_utils.temporal import (
    install_versioning_function,
    uninstall_versioning_function,
)

# revision identifiers, used by Alembic.
revision: str = "2746c96798b3"
down_revision: str | Sequence[str] | None = "3d58b28e50a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    install_versioning_function(op, version="v1")


def downgrade() -> None:
    uninstall_versioning_function(op)
