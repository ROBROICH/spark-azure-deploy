"""make process_step legacy nullable

Revision ID: c42f6a8b9e10
Revises: 008cd0b7252c
Create Date: 2026-05-26 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "c42f6a8b9e10"
down_revision = "008cd0b7252c"
branch_labels = None
depends_on = None

PROCESS_STEP_ENUM = sa.Enum(
    "formalCompletenessCheck",
    "plausibilityCheck",
    "materialCompletenessCheck",
    "legalReview",
    name="processstep",
)


def upgrade() -> None:
    # process_step was removed from the frontend-facing API, but existing
    # process step data is intentionally kept as legacy metadata.
    op.alter_column(
        "supplementary_request",
        "process_step",
        existing_type=PROCESS_STEP_ENUM,
        nullable=True,
    )
    op.alter_column(
        "supplementary_request_history",
        "process_step",
        existing_type=PROCESS_STEP_ENUM,
        nullable=True,
    )


def downgrade() -> None:
    # Downgrading restores the old NOT NULL contract, so legacy-free rows need
    # the former default value before the constraint can be reintroduced.
    op.execute(
        "UPDATE supplementary_request_history SET process_step = 'formalCompletenessCheck' WHERE process_step IS NULL"
    )
    op.execute("UPDATE supplementary_request SET process_step = 'formalCompletenessCheck' WHERE process_step IS NULL")
    op.alter_column(
        "supplementary_request_history",
        "process_step",
        existing_type=PROCESS_STEP_ENUM,
        nullable=False,
    )
    op.alter_column(
        "supplementary_request",
        "process_step",
        existing_type=PROCESS_STEP_ENUM,
        nullable=False,
    )
