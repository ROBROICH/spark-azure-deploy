"""add temporal versioning for all existing tables

Revision ID: c936a519dee7
Revises: 391f5731b6f2
Create Date: 2026-04-23 11:43:01.715336

"""

from collections.abc import Sequence

from alembic import op
from alembic_utils.temporal import (
    install_versioning_function,
    uninstall_versioning_function,
)

# revision identifiers, used by Alembic.
revision: str = "c936a519dee7"
down_revision: str | Sequence[str] | None = "391f5731b6f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    install_versioning_function(op, version="v1")


def downgrade() -> None:
    uninstall_versioning_function(op)
