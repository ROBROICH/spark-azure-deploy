"""add temporal versioning for all existing tables

Revision ID: 35e36acd8351
Revises: 0ffebf9f77e6
Create Date: 2026-04-23 11:43:01.694099

"""

from collections.abc import Sequence

from alembic import op
from alembic_utils.temporal import (
    install_versioning_function,
    uninstall_versioning_function,
)

# revision identifiers, used by Alembic.
revision: str = "35e36acd8351"
down_revision: str | Sequence[str] | None = "0ffebf9f77e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    install_versioning_function(op, version="v1")


def downgrade() -> None:
    uninstall_versioning_function(op)
