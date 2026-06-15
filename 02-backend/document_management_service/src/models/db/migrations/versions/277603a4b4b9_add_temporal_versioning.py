"""add temporal versioning for all existing tables

Revision ID: 277603a4b4b9
Revises: b7e7ac3e4cf4
Create Date: 2026-04-23 11:43:01.699544

"""

from collections.abc import Sequence

from alembic import op
from alembic_utils.temporal import (
    install_versioning_function,
    uninstall_versioning_function,
)

# revision identifiers, used by Alembic.
revision: str = "277603a4b4b9"
down_revision: str | Sequence[str] | None = "b7e7ac3e4cf4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    install_versioning_function(op, version="v1")


def downgrade() -> None:
    uninstall_versioning_function(op)
