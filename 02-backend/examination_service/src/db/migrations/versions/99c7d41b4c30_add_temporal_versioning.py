"""add temporal versioning for all existing tables

Revision ID: 99c7d41b4c30
Revises: 1359f7e07cf7
Create Date: 2026-04-23 11:43:01.710656

"""

from collections.abc import Sequence

from alembic import op
from alembic_utils.temporal import (
    install_versioning_function,
    uninstall_versioning_function,
)

# revision identifiers, used by Alembic.
revision: str = "99c7d41b4c30"
down_revision: str | Sequence[str] | None = "1359f7e07cf7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    install_versioning_function(op, version="v1")


def downgrade() -> None:
    uninstall_versioning_function(op)
