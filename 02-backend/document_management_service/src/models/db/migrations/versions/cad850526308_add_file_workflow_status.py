"""Add workflow_status to file table

Revision ID: cad850526308
Revises: 0bdaa4d270d6
Create Date: 2026-03-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "cad850526308"
down_revision: str | Sequence[str] | None = "0bdaa4d270d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

WORKFLOW_STATUS_ENUM_NAME = "workflowstatusenum"


def upgrade() -> None:
    # Enum already exists from zip_file migration — reuse it
    workflow_status_enum = sa.Enum(
        "PENDING",
        "RUNNING",
        "COMPLETED",
        "FAILED",
        "CANCELED",
        "TERMINATED",
        "CONTINUED_AS_NEW",
        "TIMED_OUT",
        "REQUIRES_APPROVAL",
        name=WORKFLOW_STATUS_ENUM_NAME,
        create_type=False,
    )

    op.add_column(
        "file",
        sa.Column(
            "workflow_status",
            workflow_status_enum,
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("file", "workflow_status")
