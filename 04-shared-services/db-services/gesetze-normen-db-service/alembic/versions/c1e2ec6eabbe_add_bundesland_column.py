"""add_bundesland_column

Revision ID: c1e2ec6eabbe
Revises: 48f3116b1e6a
Create Date: 2026-04-09 14:40:55.246137

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c1e2ec6eabbe'
down_revision: Union[str, Sequence[str], None] = '48f3116b1e6a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add nullable bundesland column with index to documents table."""
    op.add_column('documents', sa.Column('bundesland', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.create_index(op.f('ix_documents_bundesland'), 'documents', ['bundesland'], unique=False)


def downgrade() -> None:
    """Remove bundesland column."""
    op.drop_index(op.f('ix_documents_bundesland'), table_name='documents')
    op.drop_column('documents', 'bundesland')
