"""add temporal versioning for all existing tables

Revision ID: ee774fc567cf
Revises: 51686692769b
Create Date: 2026-04-23 11:43:01.720275

"""

from collections.abc import Sequence

from alembic import op
from alembic_utils.temporal import (
    install_versioning_function,
    uninstall_versioning_function,
)

# revision identifiers, used by Alembic.
revision: str = "ee774fc567cf"
down_revision: str | Sequence[str] | None = "51686692769b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    install_versioning_function(op, version="v1")


def downgrade() -> None:
    uninstall_versioning_function(op)
