"""project_topics_and_defaults

Revision ID: 53c5bdb706d9
Revises: e8e260e84a54
Create Date: 2026-04-01 16:07:32.023431

"""

import uuid
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

DEFAULT_PROJECT_TYPE_NAME = "Fernstraße"


def normalize_paragraph_nr(raw: str | None) -> str | None:
    if not raw:
        return raw

    stripped = raw.strip()
    while stripped.startswith("\u00a7"):
        stripped = stripped[1:].lstrip()
    return stripped.strip()


@dataclass(frozen=True)
class TopicNormSeed:
    jurabk: str
    paragraph_nr: str

    def __post_init__(self) -> None:
        normalized = normalize_paragraph_nr(self.paragraph_nr)
        if normalized != self.paragraph_nr:
            object.__setattr__(self, "paragraph_nr", normalized)


@dataclass(frozen=True)
class TopicSeed:
    name: str
    description: str
    norms: tuple[TopicNormSeed, ...] = ()


DEFAULT_TOPICS_BY_PROJECT_TYPE_NAME: dict[str, tuple[TopicSeed, ...]] = {
    DEFAULT_PROJECT_TYPE_NAME: (
        TopicSeed(
            name="Sonstiges / Kein Thema",
            description="Dokumente ohne eindeutige Zuordnung zu den definierten Prüfthemen.",
        ),
        TopicSeed(
            name="Artenschutz",
            description="Prüfung der Auswirkungen auf geschützte Arten und Einhaltung artenschutzrechtlicher Vorgaben.",
            norms=(
                TopicNormSeed("BNatSchG", "44"),
                TopicNormSeed("BNatSchG", "45"),
                TopicNormSeed("BNatSchG", "17"),
            ),
        ),
        TopicSeed(
            name="Umweltverträglichkeit",
            description="Bewertung der Umweltauswirkungen des Vorhabens im Rahmen der UVP.",
            norms=(
                TopicNormSeed("UVPG", "15"),
                TopicNormSeed("UVPG", "16"),
                TopicNormSeed("UVPG", "17"),
                TopicNormSeed("UVPG", "18"),
                TopicNormSeed("UVPG", "19"),
                TopicNormSeed("UVPG", "20"),
                TopicNormSeed("UVPG", "21"),
                TopicNormSeed("UVPG", "22"),
                TopicNormSeed("UVPG", "23"),
                TopicNormSeed("UVPG", "24"),
                TopicNormSeed("UVPG", "25"),
                TopicNormSeed("UVPG", "26"),
                TopicNormSeed("UVPG", "27"),
                TopicNormSeed("UVPG", "28"),
                TopicNormSeed("OGewV", "1"),
                TopicNormSeed("OGewV", "2"),
                TopicNormSeed("OGewV", "3"),
                TopicNormSeed("OGewV", "4"),
                TopicNormSeed("BBodSchV", "1"),
                TopicNormSeed("BBodSchV", "2"),
                TopicNormSeed("BBodSchV", "3"),
                TopicNormSeed("BImSchG", "22"),
                TopicNormSeed("BNatSchG", "13"),
                TopicNormSeed("BNatSchG", "44"),
                TopicNormSeed("BNatSchG", "45"),
                TopicNormSeed("BNatSchG", "17"),
            ),
        ),
        TopicSeed(
            name="Energiewirtschaft",
            description="Einordnung des Vorhabens in energiepolitische und energiewirtschaftliche Zusammenhänge.",
            norms=(
                TopicNormSeed("EnWG", "1"),
                TopicNormSeed("EnWG", "1a"),
                TopicNormSeed("EnWG", "2"),
                TopicNormSeed("EnWG", "43"),
                TopicNormSeed("GasHDrLtgV", "1"),
                TopicNormSeed("GasHDrLtgV", "2"),
                TopicNormSeed("GasHDrLtgV", "3"),
                TopicNormSeed("NABEG", "1"),
                TopicNormSeed("NABEG", "2"),
                TopicNormSeed("NABEG", "3"),
                TopicNormSeed("NABEG", "3a"),
                TopicNormSeed("NABEG", "4"),
                TopicNormSeed("UVPG", "16"),
            ),
        ),
        TopicSeed(
            name="Notwendigkeit Planfeststellungsverfahren",
            description="Prüfung, ob für das Vorhaben ein Planfeststellungsverfahren erforderlich ist.",
            norms=(
                TopicNormSeed("EnWG", "1"),
                TopicNormSeed("EnWG", "1a"),
                TopicNormSeed("EnWG", "2"),
                TopicNormSeed("EnWG", "43"),
                TopicNormSeed("UVPG", "15"),
            ),
        ),
        TopicSeed(
            name="Planrechtfertigung und Abschnittsbildung",
            description="Begründung der Planung sowie Aufteilung des Vorhabens in zulässige Abschnitte.",
            norms=(
                TopicNormSeed("EnWG", "43"),
                TopicNormSeed("NABEG", "1"),
                TopicNormSeed("NABEG", "2"),
                TopicNormSeed("NABEG", "3"),
                TopicNormSeed("NABEG", "3a"),
                TopicNormSeed("NABEG", "4"),
                TopicNormSeed("UVPG", "16"),
            ),
        ),
        TopicSeed(
            name="Zuständigkeit und Konzentrationswirkung",
            description="Klärung der behördlichen Zuständigkeit und der gebündelten Genehmigungswirkung.",
            norms=(
                TopicNormSeed("EnWG", "43"),
                TopicNormSeed("NABEG", "1"),
                TopicNormSeed("NABEG", "2"),
                TopicNormSeed("NABEG", "3"),
                TopicNormSeed("NABEG", "3a"),
                TopicNormSeed("NABEG", "4"),
            ),
        ),
        TopicSeed(
            name="Anhörungsverfahren",
            description="Durchführung und Dokumentation der Beteiligung von Behörden und Öffentlichkeit.",
            norms=(
                TopicNormSeed("EnWG", "43"),
                TopicNormSeed("UVPG", "20"),
                TopicNormSeed("UVPG", "21"),
                TopicNormSeed("UVPG", "22"),
                TopicNormSeed("UVPG", "23"),
                TopicNormSeed("UVPG", "24"),
                TopicNormSeed("UVPG", "25"),
                TopicNormSeed("UVPG", "26"),
                TopicNormSeed("UVPG", "27"),
                TopicNormSeed("UVPG", "28"),
            ),
        ),
        TopicSeed(
            name="Alternativenprüfung und Variantenuntersuchung",
            description="Vergleich möglicher Alternativen und Auswahl der vorzugswürdigen Variante.",
            norms=(
                TopicNormSeed("EnWG", "43"),
                TopicNormSeed("UVPG", "16"),
                TopicNormSeed("UVPG", "17"),
                TopicNormSeed("UVPG", "18"),
            ),
        ),
        TopicSeed(
            name="Unfall- und Katastrophenschutz",
            description="Bewertung von Risiken sowie Maßnahmen zur Gefahrenabwehr und Schadensminimierung.",
            norms=(
                TopicNormSeed("EnWG", "1"),
                TopicNormSeed("EnWG", "1a"),
                TopicNormSeed("EnWG", "2"),
                TopicNormSeed("EnWG", "43"),
                TopicNormSeed("GasHDrLtgV", "1"),
                TopicNormSeed("GasHDrLtgV", "2"),
                TopicNormSeed("GasHDrLtgV", "3"),
                TopicNormSeed("BImSchG", "1"),
                TopicNormSeed("BImSchG", "2"),
                TopicNormSeed("BImSchG", "3"),
            ),
        ),
        TopicSeed(
            name="Naturschutz Eingriffsregelung",
            description="Bewertung von Eingriffen in Natur und Landschaft sowie Kompensationsmaßnahmen.",
            norms=(
                TopicNormSeed("BNatSchG", "13"),
                TopicNormSeed("BNatSchG", "14"),
                TopicNormSeed("BNatSchG", "15"),
                TopicNormSeed("BNatSchG", "16"),
                TopicNormSeed("BNatSchG", "17"),
                TopicNormSeed("BNatSchG", "18"),
                TopicNormSeed("BNatSchG", "19"),
            ),
        ),
        TopicSeed(
            name="Naturschutz Schutzgebiete",
            description="Prüfung von Auswirkungen auf ausgewiesene Schutzgebiete.",
            norms=(
                TopicNormSeed("BNatSchG", "20"),
                TopicNormSeed("BNatSchG", "21"),
                TopicNormSeed("BNatSchG", "22"),
                TopicNormSeed("BNatSchG", "23"),
                TopicNormSeed("BNatSchG", "24"),
                TopicNormSeed("BNatSchG", "25"),
            ),
        ),
        TopicSeed(
            name="Naturschutz Befreiungen",
            description="Voraussetzungen und Begründung für naturschutzrechtliche Befreiungen.",
            norms=(
                TopicNormSeed("BNatSchG", "13"),
                TopicNormSeed("BNatSchG", "14"),
                TopicNormSeed("BNatSchG", "15"),
                TopicNormSeed("BNatSchG", "16"),
                TopicNormSeed("BNatSchG", "17"),
                TopicNormSeed("BNatSchG", "18"),
                TopicNormSeed("BNatSchG", "19"),
                TopicNormSeed("BNatSchG", "20"),
                TopicNormSeed("BNatSchG", "21"),
                TopicNormSeed("BNatSchG", "22"),
                TopicNormSeed("BNatSchG", "23"),
                TopicNormSeed("BNatSchG", "24"),
                TopicNormSeed("BNatSchG", "25"),
            ),
        ),
        TopicSeed(
            name="Natura 2000 / FFH-Verträglichkeit",
            description="Prüfung der Verträglichkeit mit Natura 2000- und FFH-Gebieten.",
            norms=(
                TopicNormSeed("BNatSchG", "20"),
                TopicNormSeed("BNatSchG", "21"),
                TopicNormSeed("BNatSchG", "22"),
                TopicNormSeed("BNatSchG", "23"),
                TopicNormSeed("BNatSchG", "24"),
                TopicNormSeed("BNatSchG", "25"),
                TopicNormSeed("BNatSchG", "44"),
                TopicNormSeed("BNatSchG", "45"),
                TopicNormSeed("BNatSchG", "17"),
            ),
        ),
        TopicSeed(
            name="WRRL oberirdische Gewässer",
            description="Bewertung nach Wasserrahmenrichtlinie für oberirdische Gewässer.",
            norms=(
                TopicNormSeed("OGewV", "1"),
                TopicNormSeed("OGewV", "2"),
                TopicNormSeed("OGewV", "3"),
                TopicNormSeed("OGewV", "4"),
            ),
        ),
        TopicSeed(
            name="WRRL Grundwasser",
            description="Bewertung nach Wasserrahmenrichtlinie für Grundwasser.",
            norms=(
                TopicNormSeed("OGewV", "1"),
                TopicNormSeed("OGewV", "2"),
                TopicNormSeed("OGewV", "3"),
                TopicNormSeed("OGewV", "4"),
            ),
        ),
        TopicSeed(
            name="Bodenschutz und Altlasten",
            description="Untersuchung von Bodenbelastungen und Altlastenrisiken.",
            norms=(
                TopicNormSeed("BBodSchV", "1"),
                TopicNormSeed("BBodSchV", "2"),
                TopicNormSeed("BBodSchV", "3"),
                TopicNormSeed("ErsatzbaustoffV", "1"),
                TopicNormSeed("ErsatzbaustoffV", "2"),
                TopicNormSeed("ErsatzbaustoffV", "3"),
            ),
        ),
        TopicSeed(
            name="Immissionsschutz Baulärm",
            description="Bewertung und Begrenzung von Lärmemissionen während der Bauphase.",
            norms=(
                TopicNormSeed("BImSchG", "22"),
                TopicNormSeed("BImSchG", "3"),
            ),
        ),
        TopicSeed(
            name="Immissionsschutz Betrieb und EMF",
            description="Bewertung von Emissionen und elektromagnetischen Feldern im Betrieb.",
            norms=(
                TopicNormSeed("BImSchG", "22"),
                TopicNormSeed("BImSchG", "1"),
                TopicNormSeed("BImSchG", "2"),
                TopicNormSeed("BImSchG", "3"),
                TopicNormSeed("BImSchG", "4"),
                TopicNormSeed("BImSchG", "5"),
                TopicNormSeed("BImSchG", "6"),
                TopicNormSeed("BImSchG", "7"),
                TopicNormSeed("BImSchG", "8"),
                TopicNormSeed("BImSchG", "8a"),
            ),
        ),
        TopicSeed(
            name="Wasserrecht Erlaubnisse",
            description="Erforderliche wasserrechtliche Erlaubnisse und Genehmigungen.",
            norms=(
                TopicNormSeed("OGewV", "1"),
                TopicNormSeed("OGewV", "2"),
                TopicNormSeed("OGewV", "3"),
                TopicNormSeed("OGewV", "4"),
            ),
        ),
        TopicSeed(
            name="Wasserrecht Anlagen an Gewässern",
            description="Zulässigkeit von Anlagen in, an oder über Gewässern.",
            norms=(
                TopicNormSeed("OGewV", "1"),
                TopicNormSeed("OGewV", "2"),
                TopicNormSeed("OGewV", "3"),
                TopicNormSeed("OGewV", "4"),
            ),
        ),
        TopicSeed(
            name="Wasserrecht Ufer- und Gewässerrandstreifen",
            description="Einhaltung von Schutzanforderungen an Ufer- und Randstreifen.",
            norms=(
                TopicNormSeed("OGewV", "1"),
                TopicNormSeed("OGewV", "2"),
                TopicNormSeed("OGewV", "3"),
                TopicNormSeed("OGewV", "4"),
            ),
        ),
        TopicSeed(
            name="Wasserrecht Hochwasserschutz",
            description="Berücksichtigung von Hochwasserrisiken und Schutzmaßnahmen.",
            norms=(
                TopicNormSeed("OGewV", "1"),
                TopicNormSeed("OGewV", "2"),
                TopicNormSeed("OGewV", "3"),
                TopicNormSeed("OGewV", "4"),
            ),
        ),
        TopicSeed(
            name="Forstwirtschaft",
            description="Auswirkungen auf Waldflächen und forstrechtliche Belange.",
            norms=(
                TopicNormSeed("BNatSchG", "20"),
                TopicNormSeed("BNatSchG", "21"),
                TopicNormSeed("BNatSchG", "22"),
                TopicNormSeed("BNatSchG", "23"),
                TopicNormSeed("BNatSchG", "24"),
                TopicNormSeed("BNatSchG", "25"),
            ),
        ),
        TopicSeed(
            name="Denkmalschutz",
            description="Berücksichtigung denkmalrechtlicher Anforderungen und Schutzgüter.",
            norms=(
                TopicNormSeed("EnWG", "43"),
                TopicNormSeed("UVPG", "15"),
                TopicNormSeed("UVPG", "16"),
            ),
        ),
    ),
}


def get_default_topics_for_project_type_name(project_type_name: str) -> tuple[TopicSeed, ...]:
    """Return the default topic templates for a project type."""
    return DEFAULT_TOPICS_BY_PROJECT_TYPE_NAME.get(project_type_name, ())


# revision identifiers, used by Alembic.
revision: str = "53c5bdb706d9"
down_revision: str | Sequence[str] | None = "e8e260e84a54"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TOPIC_NAMESPACE = uuid.UUID("98a78dbf-d255-4e45-bf15-4e45b315e8f4")
TOPIC_NORM_NAMESPACE = uuid.UUID("7f574e2a-c6c4-4b66-8e84-f0e59f6f5f80")


def _topic_id_for_legacy_assignment(project_id: uuid.UUID, legacy_topic_id: uuid.UUID) -> uuid.UUID:
    return uuid.uuid5(TOPIC_NAMESPACE, f"{project_id}:{legacy_topic_id}")


def _topic_id_for_default(project_id: uuid.UUID, topic_name: str) -> uuid.UUID:
    return uuid.uuid5(TOPIC_NAMESPACE, f"{project_id}:default:{topic_name}")


def _topic_norm_id(topic_id: uuid.UUID, jurabk: str, paragraph_nr: str) -> uuid.UUID:
    return uuid.uuid5(TOPIC_NORM_NAMESPACE, f"{topic_id}:{jurabk}:{paragraph_nr}")


def _sort_topic_ids(topic_ids: Iterable[uuid.UUID], topics_by_id: dict[uuid.UUID, dict]) -> list[uuid.UUID]:
    ordered: list[uuid.UUID] = []
    pending = set(topic_ids)
    seen: set[uuid.UUID] = set()

    def visit(topic_id: uuid.UUID) -> None:
        if topic_id in seen or topic_id not in pending:
            return

        topic_row = topics_by_id.get(topic_id)
        parent_topic_id = topic_row["parent_topic_id"] if topic_row else None
        if parent_topic_id in pending:
            visit(parent_topic_id)

        seen.add(topic_id)
        ordered.append(topic_id)

    for topic_id in sorted(pending):
        visit(topic_id)

    return ordered


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()

    op.create_table(
        "topic_norm",
        sa.Column("topic_id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column(
            "update_type",
            sa.Enum("AUTOMATED", "MANUAL", name="updatetype", native_enum=False, create_constraint=True),
            nullable=True,
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "frontend_parent_ids",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("ARRAY[]::varchar[]"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("jurabk", sa.String(), nullable=False),
        sa.Column("paragraph_nr", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["topic_id"], ["topic.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("topic_id", "jurabk", "paragraph_nr", name="uq_topic_norm"),
    )

    op.add_column("topic", sa.Column("project_id", sa.UUID(), nullable=True))
    op.add_column(
        "topic",
        sa.Column(
            "update_type",
            sa.Enum("AUTOMATED", "MANUAL", name="updatetype", native_enum=False, create_constraint=True),
            nullable=True,
        ),
    )
    op.add_column(
        "topic",
        sa.Column(
            "frontend_parent_ids",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("ARRAY[]::varchar[]"),
        ),
    )

    project_rows = bind.execute(
        sa.text(
            """
            SELECT p.id, p.project_type_id, p.created_at, p.updated_at, pt.name AS project_type_name
            FROM project AS p
            JOIN project_type AS pt ON pt.id = p.project_type_id
            ORDER BY p.id
            """
        )
    ).mappings()
    projects = list(project_rows)

    legacy_topic_rows = bind.execute(
        sa.text(
            """
            SELECT id, parent_topic_id, name, description, is_deleted, created_at, updated_at
            FROM topic
            ORDER BY id
            """
        )
    ).mappings()
    legacy_topics_by_id = {row["id"]: row for row in legacy_topic_rows}

    assignment_rows = bind.execute(
        sa.text(
            """
            SELECT project_id, topic_id
            FROM project_topic
            WHERE COALESCE(is_deleted, false) IS false
            ORDER BY project_id, topic_id
            """
        )
    ).mappings()
    assigned_topic_ids_by_project: dict[uuid.UUID, set[uuid.UUID]] = defaultdict(set)
    for row in assignment_rows:
        assigned_topic_ids_by_project[row["project_id"]].add(row["topic_id"])

    topic_inserts: list[dict] = []
    topic_norm_inserts: list[dict] = []

    for project in projects:
        project_id = project["id"]
        assigned_topic_ids = assigned_topic_ids_by_project.get(project_id, set())

        if assigned_topic_ids:
            for legacy_topic_id in _sort_topic_ids(assigned_topic_ids, legacy_topics_by_id):
                legacy_topic = legacy_topics_by_id[legacy_topic_id]
                parent_topic_id = legacy_topic["parent_topic_id"]
                topic_id = _topic_id_for_legacy_assignment(project_id, legacy_topic_id)
                cloned_parent_topic_id = (
                    _topic_id_for_legacy_assignment(project_id, parent_topic_id)
                    if parent_topic_id in assigned_topic_ids
                    else None
                )
                topic_inserts.append(
                    {
                        "id": topic_id,
                        "project_id": project_id,
                        "parent_topic_id": cloned_parent_topic_id,
                        "name": legacy_topic["name"],
                        "description": legacy_topic["description"],
                        "is_deleted": legacy_topic["is_deleted"],
                        "frontend_parent_ids": [],
                        "update_type": "AUTOMATED",
                        "created_at": legacy_topic["created_at"],
                        "updated_at": legacy_topic["updated_at"],
                    }
                )
        else:
            default_topics = DEFAULT_TOPICS_BY_PROJECT_TYPE_NAME.get(project["project_type_name"], ())
            for topic_seed in default_topics:
                topic_id = _topic_id_for_default(project_id, topic_seed.name)
                topic_inserts.append(
                    {
                        "id": topic_id,
                        "project_id": project_id,
                        "parent_topic_id": None,
                        "name": topic_seed.name,
                        "description": topic_seed.description,
                        "is_deleted": False,
                        "frontend_parent_ids": [],
                        "update_type": "AUTOMATED",
                        "created_at": project["created_at"] or datetime.now(UTC),
                        "updated_at": project["updated_at"] or datetime.now(UTC),
                    }
                )

    default_norms_by_project_type_and_topic = {
        (project_type_name, topic_seed.name): topic_seed.norms
        for project_type_name, topic_seeds in DEFAULT_TOPICS_BY_PROJECT_TYPE_NAME.items()
        for topic_seed in topic_seeds
    }
    project_type_name_by_project_id = {project["id"]: project["project_type_name"] for project in projects}

    for topic_insert in topic_inserts:
        topic_norms = default_norms_by_project_type_and_topic.get(
            (
                project_type_name_by_project_id.get(topic_insert["project_id"]),
                topic_insert["name"],
            ),
            (),
        )
        for topic_norm in topic_norms:
            topic_norm_inserts.append(
                {
                    "id": _topic_norm_id(topic_insert["id"], topic_norm.jurabk, topic_norm.paragraph_nr),
                    "topic_id": topic_insert["id"],
                    "project_id": topic_insert["project_id"],
                    "jurabk": topic_norm.jurabk,
                    "paragraph_nr": topic_norm.paragraph_nr,
                    "is_deleted": False,
                    "frontend_parent_ids": [],
                    "update_type": "AUTOMATED",
                    "created_at": topic_insert["created_at"],
                    "updated_at": topic_insert["updated_at"],
                }
            )

    topic_table = sa.table(
        "topic",
        sa.column("id", sa.UUID()),
        sa.column("project_id", sa.UUID()),
        sa.column("parent_topic_id", sa.UUID()),
        sa.column("name", sa.String()),
        sa.column("description", sa.String()),
        sa.column("is_deleted", sa.Boolean()),
        sa.column("frontend_parent_ids", postgresql.ARRAY(sa.String())),
        sa.column("update_type", sa.String()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    if topic_inserts:
        op.bulk_insert(topic_table, topic_inserts)

    topic_norm_table = sa.table(
        "topic_norm",
        sa.column("id", sa.UUID()),
        sa.column("topic_id", sa.UUID()),
        sa.column("project_id", sa.UUID()),
        sa.column("jurabk", sa.String()),
        sa.column("paragraph_nr", sa.String()),
        sa.column("is_deleted", sa.Boolean()),
        sa.column("frontend_parent_ids", postgresql.ARRAY(sa.String())),
        sa.column("update_type", sa.String()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    if topic_norm_inserts:
        op.bulk_insert(topic_norm_table, topic_norm_inserts)

    op.drop_index(op.f("ix_project_topic_project_id"), table_name="project_topic")
    op.drop_index(
        op.f("ix_project_topic_project_id_active"), table_name="project_topic", postgresql_where="(is_deleted IS FALSE)"
    )
    op.drop_index(op.f("ix_project_topic_topic_id"), table_name="project_topic")
    op.drop_table("project_topic")

    op.drop_index(op.f("ix_project_type_topic_project_type_id"), table_name="project_type_topic")
    op.drop_index(op.f("ix_project_type_topic_topic_id"), table_name="project_type_topic")
    op.drop_table("project_type_topic")

    bind.execute(sa.text("DELETE FROM topic WHERE project_id IS NULL"))

    op.drop_index(op.f("uq_parent_topic_name_active"), table_name="topic", postgresql_where="false")
    op.alter_column("topic", "project_id", existing_type=sa.UUID(), nullable=False)
    op.create_index(op.f("ix_topic_project_id"), "topic", ["project_id"], unique=False)
    op.create_index(
        "ix_topic_project_id_active",
        "topic",
        ["project_id"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.create_index(
        "uq_topic_project_parent_name_active",
        "topic",
        ["project_id", "parent_topic_id", "name"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.create_foreign_key(None, "topic", "project", ["project_id"], ["id"], ondelete="CASCADE")

    op.create_index(op.f("ix_topic_norm_project_id"), "topic_norm", ["project_id"], unique=False)
    op.create_index(
        "ix_topic_norm_project_id_active",
        "topic_norm",
        ["project_id"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.create_index(op.f("ix_topic_norm_topic_id"), "topic_norm", ["topic_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    raise NotImplementedError("This migration performs an irreversible topic data split per project.")
