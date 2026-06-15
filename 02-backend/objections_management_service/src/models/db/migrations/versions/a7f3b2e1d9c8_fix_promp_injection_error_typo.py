"""Fix typo in extractionstatus enum: PROMP_INJECTION_ERROR -> PROMPT_INJECTION_ERROR.

Revision ID: a7f3b2e1d9c8
Revises: 9c2d1f0a4b6e
Create Date: 2026-05-15

"""

from collections.abc import Sequence

from alembic import op

revision: str = "a7f3b2e1d9c8"
down_revision: str | Sequence[str] | None = "9c2d1f0a4b6e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # DB stores enum names (uppercase) because ExtractionStatus has no values_callable
    op.execute("ALTER TYPE extractionstatus RENAME VALUE 'PROMP_INJECTION_ERROR' TO 'PROMPT_INJECTION_ERROR'")


def downgrade() -> None:
    op.execute("ALTER TYPE extractionstatus RENAME VALUE 'PROMPT_INJECTION_ERROR' TO 'PROMP_INJECTION_ERROR'")
