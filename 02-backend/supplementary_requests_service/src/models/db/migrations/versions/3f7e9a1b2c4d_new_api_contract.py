"""Migrate supplementary_request table to new API contract.

Revision ID: a1b2c3d4e5f6
Revises: 9c6e22019df6
Create Date: 2026-03-02 10:17:43.000000

Changes:
- Rename: name -> title, description -> reason, use_in_report -> included_in_letter
- Add: priority (enum), process_step (enum), source_type (enum), source_item_id
- Drop: status column and supplementaryrequeststatus enum
- Add: partial unique index on (project_id, source_type, source_item_id)
"""

import sqlalchemy as sa
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "9c6e22019df6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Rename existing columns
    op.alter_column("supplementary_request", "name", new_column_name="title")
    op.alter_column("supplementary_request", "description", new_column_name="reason")
    op.alter_column("supplementary_request", "use_in_report", new_column_name="included_in_letter")

    # 2. Align string lengths with API contract
    op.alter_column("supplementary_request", "title", type_=sa.String(255))
    op.alter_column("supplementary_request", "reason", type_=sa.String(2000))

    # 3. Create new enum types
    priority_enum = sa.Enum("must", "should", name="priority")
    priority_enum.create(op.get_bind(), checkfirst=True)

    process_step_enum = sa.Enum(
        "formalCompletenessCheck",
        "plausibilityCheck",
        "materialCompletenessCheck",
        "legalReview",
        name="processstep",
    )
    process_step_enum.create(op.get_bind(), checkfirst=True)

    source_type_enum = sa.Enum(
        "tableOfContents",
        "requiredDocuments",
        "contradiction",
        "materialLaw",
        "materialNorm",
        "materialSatz",
        "materialFundstelle",
        "manual",
        name="sourcetype",
    )
    source_type_enum.create(op.get_bind(), checkfirst=True)

    # 4. Add new columns (with server defaults for existing rows)
    op.add_column(
        "supplementary_request",
        sa.Column("priority", priority_enum, nullable=False, server_default="must"),
    )
    op.add_column(
        "supplementary_request",
        sa.Column(
            "process_step",
            process_step_enum,
            nullable=False,
            server_default="formalCompletenessCheck",
        ),
    )
    op.add_column(
        "supplementary_request",
        sa.Column("source_type", source_type_enum, nullable=True),
    )
    op.add_column(
        "supplementary_request",
        sa.Column("source_item_id", sa.String(255), nullable=True),
    )

    # 5. Remove server defaults (keep schema clean)
    op.alter_column("supplementary_request", "priority", server_default=None)
    op.alter_column("supplementary_request", "process_step", server_default=None)

    # 6. Drop status column and its enum type
    op.drop_column("supplementary_request", "status")
    sa.Enum(name="supplementaryrequeststatus").drop(op.get_bind(), checkfirst=True)

    # 7. Add partial unique index for source bindings
    op.create_index(
        "uq_project_source_binding",
        "supplementary_request",
        ["project_id", "source_type", "source_item_id"],
        unique=True,
        postgresql_where=sa.text("source_item_id IS NOT NULL"),
    )


def downgrade() -> None:
    # 1. Drop partial unique index
    op.drop_index("uq_project_source_binding", table_name="supplementary_request")

    # 2. Re-create status enum and column
    status_enum = sa.Enum("OFFEN", "NACHGEFORDERT", name="supplementaryrequeststatus")
    status_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "supplementary_request",
        sa.Column("status", status_enum, nullable=False, server_default="OFFEN"),
    )
    op.alter_column("supplementary_request", "status", server_default=None)

    # 3. Drop new columns
    op.drop_column("supplementary_request", "source_item_id")
    op.drop_column("supplementary_request", "source_type")
    op.drop_column("supplementary_request", "process_step")
    op.drop_column("supplementary_request", "priority")

    # 4. Drop new enum types
    sa.Enum(name="sourcetype").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="processstep").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="priority").drop(op.get_bind(), checkfirst=True)

    # 5. Revert column types
    op.alter_column("supplementary_request", "title", type_=sa.String())
    op.alter_column("supplementary_request", "reason", type_=sa.Text())

    # 6. Rename columns back
    op.alter_column("supplementary_request", "included_in_letter", new_column_name="use_in_report")
    op.alter_column("supplementary_request", "reason", new_column_name="description")
    op.alter_column("supplementary_request", "title", new_column_name="name")
