"""replace report/bewertung_tbm/bewertung_satz with bewertung/bewertung_kapitel/bewertung_quelle

Revision ID: c3f8a1b7d9e2
Revises: a48f13bae7bf
Create Date: 2026-04-09 18:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c3f8a1b7d9e2"
down_revision: str | Sequence[str] | None = "a48f13bae7bf"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Drop old bewertung tables and create new ones.

    Idempotent: safe to re-run against a database already in (partial) target
    state. All affected tables are dropped with CASCADE and recreated fresh,
    so any leftover indices, constraints, or foreign keys are cleaned up
    regardless of starting state.
    """

    # ── Drop everything affected (CASCADE handles indices and FKs) ──
    op.execute("DROP TABLE IF EXISTS verwaltungsaktentwurf_teil CASCADE")
    op.execute("DROP TABLE IF EXISTS bewertung_quelle CASCADE")
    op.execute("DROP TABLE IF EXISTS bewertung_kapitel CASCADE")
    op.execute("DROP TABLE IF EXISTS bewertung CASCADE")
    op.execute("DROP TABLE IF EXISTS bewertung_satz CASCADE")
    op.execute("DROP TABLE IF EXISTS bewertung_tbm CASCADE")
    op.execute("DROP TABLE IF EXISTS report CASCADE")

    # ── Create new tables ───────────────────────────────────────────

    op.create_table(
        "bewertung",
        sa.Column("satz_id", sa.UUID(), nullable=False),
        sa.Column("result", sa.String(), nullable=False),
        sa.Column("kurzform", sa.Text(), nullable=True),
        sa.Column("norm", sa.Text(), nullable=False),
        sa.Column("markdown_text_id", sa.UUID(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.Column(
            "update_type", postgresql.ENUM("AUTOMATED", "MANUAL", name="updatetype", create_type=False), nullable=True
        ),
        sa.Column(
            "frontend_parent_ids",
            postgresql.ARRAY(sa.String()),
            server_default=sa.text("ARRAY[]::varchar[]"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["satz_id"], ["satz.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["markdown_text_id"], ["markdown_text.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_bewertung_satz_id"), "bewertung", ["satz_id"], unique=False)
    op.create_index(op.f("ix_bewertung_markdown_text_id"), "bewertung", ["markdown_text_id"], unique=False)
    op.create_index(op.f("ix_bewertung_project_id"), "bewertung", ["project_id"], unique=False)
    op.create_index(
        "ix_bewertung_project_id_active",
        "bewertung",
        ["project_id"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )

    op.create_table(
        "bewertung_kapitel",
        sa.Column("bewertung_id", sa.UUID(), nullable=False),
        sa.Column("titel", sa.Text(), nullable=False),
        sa.Column("markdown", sa.Text(), nullable=False),
        sa.Column("kurzform", sa.Text(), nullable=True),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.Column(
            "update_type", postgresql.ENUM("AUTOMATED", "MANUAL", name="updatetype", create_type=False), nullable=True
        ),
        sa.Column(
            "frontend_parent_ids",
            postgresql.ARRAY(sa.String()),
            server_default=sa.text("ARRAY[]::varchar[]"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["bewertung_id"], ["bewertung.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_bewertung_kapitel_bewertung_id"), "bewertung_kapitel", ["bewertung_id"], unique=False)
    op.create_index(op.f("ix_bewertung_kapitel_project_id"), "bewertung_kapitel", ["project_id"], unique=False)
    op.create_index(
        "ix_bewertung_kapitel_project_id_active",
        "bewertung_kapitel",
        ["project_id"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )

    op.create_table(
        "bewertung_quelle",
        sa.Column("bewertung_id", sa.UUID(), nullable=False),
        sa.Column("dokument_id", sa.UUID(), nullable=False),
        sa.Column("fundstelle_id", sa.UUID(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("chunk_ids", postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column("page_numbers", postgresql.ARRAY(sa.Integer()), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.Column(
            "update_type", postgresql.ENUM("AUTOMATED", "MANUAL", name="updatetype", create_type=False), nullable=True
        ),
        sa.Column(
            "frontend_parent_ids",
            postgresql.ARRAY(sa.String()),
            server_default=sa.text("ARRAY[]::varchar[]"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["bewertung_id"], ["bewertung.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["dokument_id"], ["dokument.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["fundstelle_id"], ["fundstelle.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_bewertung_quelle_bewertung_id"), "bewertung_quelle", ["bewertung_id"], unique=False)
    op.create_index(op.f("ix_bewertung_quelle_dokument_id"), "bewertung_quelle", ["dokument_id"], unique=False)
    op.create_index(op.f("ix_bewertung_quelle_fundstelle_id"), "bewertung_quelle", ["fundstelle_id"], unique=False)
    op.create_index(op.f("ix_bewertung_quelle_project_id"), "bewertung_quelle", ["project_id"], unique=False)
    op.create_index(
        "ix_bewertung_quelle_project_id_active",
        "bewertung_quelle",
        ["project_id"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )

    # ── Recreate verwaltungsaktentwurf_teil with new FK ─────────────

    op.create_table(
        "verwaltungsaktentwurf_teil",
        sa.Column("bewertung_id", sa.UUID(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.Column(
            "update_type", postgresql.ENUM("AUTOMATED", "MANUAL", name="updatetype", create_type=False), nullable=True
        ),
        sa.Column(
            "frontend_parent_ids",
            postgresql.ARRAY(sa.String()),
            server_default=sa.text("ARRAY[]::varchar[]"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["bewertung_id"], ["bewertung.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_verwaltungsaktentwurf_teil_bewertung_id"),
        "verwaltungsaktentwurf_teil",
        ["bewertung_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_verwaltungsaktentwurf_teil_project_id"), "verwaltungsaktentwurf_teil", ["project_id"], unique=False
    )
    op.create_index(
        "ix_verwaltungsaktentwurf_teil_project_id_active",
        "verwaltungsaktentwurf_teil",
        ["project_id"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )


def downgrade() -> None:
    """Restore old bewertung tables. Idempotent: safe to re-run."""

    # ── Drop new and old tables (CASCADE handles indices and FKs) ───
    op.execute("DROP TABLE IF EXISTS verwaltungsaktentwurf_teil CASCADE")
    op.execute("DROP TABLE IF EXISTS bewertung_quelle CASCADE")
    op.execute("DROP TABLE IF EXISTS bewertung_kapitel CASCADE")
    op.execute("DROP TABLE IF EXISTS bewertung CASCADE")
    op.execute("DROP TABLE IF EXISTS bewertung_satz CASCADE")
    op.execute("DROP TABLE IF EXISTS bewertung_tbm CASCADE")
    op.execute("DROP TABLE IF EXISTS report CASCADE")

    # ── Recreate old tables ─────────────────────────────────────────

    op.create_table(
        "report",
        sa.Column("fundstelle_id", sa.UUID(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.Column(
            "update_type", postgresql.ENUM("AUTOMATED", "MANUAL", name="updatetype", create_type=False), nullable=True
        ),
        sa.Column(
            "frontend_parent_ids",
            postgresql.ARRAY(sa.String()),
            server_default=sa.text("ARRAY[]::varchar[]"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["fundstelle_id"], ["fundstelle.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_report_fundstelle_id"), "report", ["fundstelle_id"], unique=False)
    op.create_index(op.f("ix_report_project_id"), "report", ["project_id"], unique=False)
    op.create_index(
        "ix_report_project_id_active",
        "report",
        ["project_id"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )

    op.create_table(
        "bewertung_tbm",
        sa.Column("report_id", sa.UUID(), nullable=False),
        sa.Column("fundstelle_id", sa.UUID(), nullable=False),
        sa.Column("atomares_tbm_id", sa.UUID(), nullable=False),
        sa.Column("result", sa.String(), nullable=False),
        sa.Column("reasoning", sa.Text(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.Column(
            "update_type", postgresql.ENUM("AUTOMATED", "MANUAL", name="updatetype", create_type=False), nullable=True
        ),
        sa.Column(
            "frontend_parent_ids",
            postgresql.ARRAY(sa.String()),
            server_default=sa.text("ARRAY[]::varchar[]"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["atomares_tbm_id"], ["atomares_tbm.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["fundstelle_id"], ["fundstelle.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["report_id"], ["report.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_bewertung_tbm_atomares_tbm_id"), "bewertung_tbm", ["atomares_tbm_id"], unique=False)
    op.create_index(op.f("ix_bewertung_tbm_fundstelle_id"), "bewertung_tbm", ["fundstelle_id"], unique=False)
    op.create_index(op.f("ix_bewertung_tbm_project_id"), "bewertung_tbm", ["project_id"], unique=False)
    op.create_index(
        "ix_bewertung_tbm_project_id_active",
        "bewertung_tbm",
        ["project_id"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.create_index(op.f("ix_bewertung_tbm_report_id"), "bewertung_tbm", ["report_id"], unique=False)

    op.create_table(
        "bewertung_satz",
        sa.Column("satz_id", sa.UUID(), nullable=False),
        sa.Column("bewertung_tbm_id", sa.UUID(), nullable=False),
        sa.Column("result", sa.String(), nullable=False),
        sa.Column("reasoning", sa.Text(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.Column(
            "update_type", postgresql.ENUM("AUTOMATED", "MANUAL", name="updatetype", create_type=False), nullable=True
        ),
        sa.Column(
            "frontend_parent_ids",
            postgresql.ARRAY(sa.String()),
            server_default=sa.text("ARRAY[]::varchar[]"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["bewertung_tbm_id"], ["bewertung_tbm.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["satz_id"], ["satz.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_bewertung_satz_bewertung_tbm_id"), "bewertung_satz", ["bewertung_tbm_id"], unique=False)
    op.create_index(op.f("ix_bewertung_satz_project_id"), "bewertung_satz", ["project_id"], unique=False)
    op.create_index(
        "ix_bewertung_satz_project_id_active",
        "bewertung_satz",
        ["project_id"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.create_index(op.f("ix_bewertung_satz_satz_id"), "bewertung_satz", ["satz_id"], unique=False)

    op.create_table(
        "verwaltungsaktentwurf_teil",
        sa.Column("bewertung_satz_id", sa.UUID(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.Column(
            "update_type", postgresql.ENUM("AUTOMATED", "MANUAL", name="updatetype", create_type=False), nullable=True
        ),
        sa.Column(
            "frontend_parent_ids",
            postgresql.ARRAY(sa.String()),
            server_default=sa.text("ARRAY[]::varchar[]"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["bewertung_satz_id"], ["bewertung_satz.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_verwaltungsaktentwurf_teil_bewertung_satz_id"),
        "verwaltungsaktentwurf_teil",
        ["bewertung_satz_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_verwaltungsaktentwurf_teil_project_id"), "verwaltungsaktentwurf_teil", ["project_id"], unique=False
    )
    op.create_index(
        "ix_verwaltungsaktentwurf_teil_project_id_active",
        "verwaltungsaktentwurf_teil",
        ["project_id"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
