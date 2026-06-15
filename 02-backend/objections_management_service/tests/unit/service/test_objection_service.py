"""Unit tests for objection service layer."""

import csv
import io
import uuid
from datetime import datetime, tzinfo
from typing import override
from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db_models import Argument, BeteiligungsEingang
from src.models.schemas.objection_schemas import (
    ArgumentStatus,
    BeteiligungTyp,
    ClassificationStatus,
    ExtractionStatus,
)
from src.services.external_clients import (
    DmsFileMetadata,
    DocumentManagementClient,
    ProjectLogicClient,
    TopicMetadata,
)
from src.services.objection_service import (
    CSV_DELIMITER,
    CSV_ENCODING,
    _extract_filename,
    _infer_beteiligung_typ,
    build_erwiderung_export_csv,
    export_arguments_to_dms,
    import_arguments_csv,
    import_arguments_from_dms,
)


class FakeDmsClient(DocumentManagementClient):
    def __init__(self, files: list[DmsFileMetadata], file_content: bytes = b"") -> None:
        self.files = files
        self.file_content = file_content
        self.get_calls: list[tuple[UUID, int]] = []
        self.list_calls: list[tuple[UUID, int, str]] = []
        self.download_calls: list[tuple[UUID, int]] = []
        self.upload_calls: list[tuple[UUID, str, str, bytes]] = []
        self.uploaded_file_id = uuid.uuid4()

    @override
    async def upload_internal_file(
        self,
        *,
        project_id: UUID,
        file_type: str,
        filename: str,
        content: bytes,
    ) -> UUID:
        self.upload_calls.append((project_id, file_type, filename, content))
        return self.uploaded_file_id

    @override
    async def get_file(self, file_id: UUID, *, project_version: int) -> DmsFileMetadata:
        self.get_calls.append((file_id, project_version))
        return next(file for file in self.files if file.id == file_id and file.project_version == project_version)

    @override
    async def list_project_files(
        self,
        *,
        project_id: UUID,
        project_version: int,
        file_type: str,
    ) -> list[DmsFileMetadata]:
        self.list_calls.append((project_id, project_version, file_type))
        return [
            file
            for file in self.files
            if file.project_id == project_id and file.project_version == project_version and file.type == file_type
        ]

    @override
    async def download_file(self, file_id: UUID, *, project_version: int) -> bytes:
        self.download_calls.append((file_id, project_version))
        return self.file_content


class FakeProjectLogicClient(ProjectLogicClient):
    def __init__(
        self,
        topics: list[TopicMetadata],
        latest_version: int = 1,
        project_name: str = "Test Project",
    ) -> None:
        self.topics = {topic.id: topic for topic in topics}
        self.latest_version = latest_version
        self.project_name = project_name

    @override
    async def get_topics(self, topic_ids: set[UUID]) -> dict[UUID, TopicMetadata]:
        return {topic_id: self.topics[topic_id] for topic_id in topic_ids if topic_id in self.topics}

    @override
    async def get_latest_project_version(self, project_id: UUID) -> int:
        return self.latest_version

    @override
    async def get_project_name(self, project_id: UUID) -> str:
        return self.project_name

    @override
    async def validate_project_write_version(self, project_id: UUID, project_version: int) -> int:
        return project_version


@pytest.mark.parametrize(
    ("document_name", "expected"),
    [
        ("S_Stellungnahme.pdf", BeteiligungTyp.STELLUNGNAHME),
        ("folder/N_Naturschutz.pdf", BeteiligungTyp.NATURSCHUTZ),
        (r"C:\uploads\E_Einwendung.pdf", BeteiligungTyp.EINWENDUNG),
        ("folder/X_Unbekannt.pdf", None),
        ("", None),
    ],
)
def test_infer_beteiligung_typ_from_filename_prefix(
    document_name: str,
    expected: BeteiligungTyp | None,
) -> None:
    assert _infer_beteiligung_typ(document_name) == expected


@pytest.mark.parametrize(
    ("document_name", "expected"),
    [
        ("folder/E_Einwendung.pdf", "E_Einwendung.pdf"),
        (r"C:\uploads\E_Einwendung.pdf", "E_Einwendung.pdf"),
        (r"folder\N_Naturschutz.pdf", "N_Naturschutz.pdf"),
        ("S_Stellungnahme.pdf", "S_Stellungnahme.pdf"),
    ],
)
def test_extract_filename_handles_filepaths(document_name: str, expected: str) -> None:
    assert _extract_filename(document_name) == expected


@pytest.mark.asyncio
async def test_build_erwiderung_export_csv_uses_business_argument_id_and_names(
    db_session: AsyncSession,
    create_test_argument: Argument,
) -> None:
    project_id = create_test_argument.project_id
    beteiligungs_eingang = (
        await db_session.execute(
            select(BeteiligungsEingang).where(BeteiligungsEingang.id == create_test_argument.beteiligungs_eingang_id)
        )
    ).scalar_one()
    assert beteiligungs_eingang is not None
    file_id = beteiligungs_eingang.file_id
    topic_id = uuid.uuid4()
    subtopic_id = uuid.uuid4()
    create_test_argument.argument_id = "A1-Einwendung_Mueller"
    create_test_argument.topic_id = None
    create_test_argument.sub_topic_id = subtopic_id
    create_test_argument.context = "Kontext mit Umlaut ä und Zeilenumbruch\nzweite Zeile"
    create_test_argument.erwiderung = "Bestehende Erwiderung für Müller"
    await db_session.commit()

    fake_dms = FakeDmsClient(
        [
            DmsFileMetadata(
                id=file_id,
                type="ewms_document",
                filename="einwendung-mueller.pdf",
                projectId=project_id,
                projectVersion=1,
            )
        ]
    )

    csv_bytes = await build_erwiderung_export_csv(
        project_id=project_id,
        db=db_session,
        dms_client=fake_dms,
        project_logic_client=FakeProjectLogicClient(
            [
                TopicMetadata(id=topic_id, name="Natur", parentTopicId=None),
                TopicMetadata(id=subtopic_id, name="Artenschutz", parentTopicId=topic_id),
            ]
        ),
    )

    csv_text = csv_bytes.decode(CSV_ENCODING)
    rows = list(csv.DictReader(io.StringIO(csv_text), delimiter=CSV_DELIMITER))

    assert rows == [
        {
            "Argument-ID": "A1-Einwendung_Mueller",
            "Thema": "Natur",
            "Unterthema": "Artenschutz",
            "Argument": "This is a test extracted argument",
            "Kontext": "Kontext mit Umlaut ä und Zeilenumbruch\nzweite Zeile",
            "Erwiderung": "Bestehende Erwiderung für Müller",
            "Einordnung": "This is a topic classification",
            "Datei": "einwendung-mueller.pdf",
        }
    ]
    assert csv_bytes.startswith(b"\xef\xbb\xbf")
    assert csv_text.startswith("Argument-ID;Thema;Unterthema;Argument;Kontext;Erwiderung;Einordnung;Datei")
    assert fake_dms.list_calls == [(project_id, 1, "ewms_document")]


@pytest.mark.asyncio
async def test_build_erwiderung_export_csv_reads_latest_version(db_session: AsyncSession) -> None:
    project_id = uuid.uuid4()
    old_file_id = uuid.uuid4()
    latest_file_id = uuid.uuid4()
    old_be = BeteiligungsEingang(
        id=uuid.uuid4(),
        project_id=project_id,
        project_version=1,
        beteiligung_typ=BeteiligungTyp.EINWENDUNG,
        file_id=old_file_id,
        extraction_status=ExtractionStatus.SUCCESS,
        classification_status=ClassificationStatus.DONE,
    )
    latest_be = BeteiligungsEingang(
        id=uuid.uuid4(),
        project_id=project_id,
        project_version=2,
        beteiligung_typ=BeteiligungTyp.EINWENDUNG,
        file_id=latest_file_id,
        extraction_status=ExtractionStatus.SUCCESS,
        classification_status=ClassificationStatus.DONE,
    )
    old_argument = Argument(
        id=uuid.uuid4(),
        project_id=project_id,
        project_version=1,
        beteiligungs_eingang_id=old_be.id,
        argument_id="A1-old.pdf",
        text="Old argument",
        status=ArgumentStatus.OPEN,
    )
    latest_argument = Argument(
        id=uuid.uuid4(),
        project_id=project_id,
        project_version=2,
        beteiligungs_eingang_id=latest_be.id,
        argument_id="A1-latest.pdf",
        text="Latest argument",
        status=ArgumentStatus.OPEN,
    )
    db_session.add_all([old_be, latest_be, old_argument, latest_argument])
    await db_session.commit()

    fake_dms = FakeDmsClient(
        [
            DmsFileMetadata(
                id=old_file_id,
                type="ewms_document",
                filename="old.pdf",
                projectId=project_id,
                projectVersion=1,
            ),
            DmsFileMetadata(
                id=latest_file_id,
                type="ewms_document",
                filename="latest.pdf",
                projectId=project_id,
                projectVersion=2,
            ),
        ]
    )

    csv_bytes = await build_erwiderung_export_csv(
        project_id=project_id,
        db=db_session,
        dms_client=fake_dms,
        project_logic_client=FakeProjectLogicClient([], latest_version=2),
    )

    rows = list(csv.DictReader(io.StringIO(csv_bytes.decode(CSV_ENCODING)), delimiter=CSV_DELIMITER))

    assert [row["Argument-ID"] for row in rows] == ["A1-latest.pdf"]
    assert rows[0]["Argument"] == "Latest argument"
    assert rows[0]["Datei"] == "latest.pdf"
    assert fake_dms.list_calls == [(project_id, 2, "ewms_document")]


@pytest.mark.asyncio
async def test_export_arguments_to_dms_uses_synopse_filename(
    db_session: AsyncSession,
    create_test_argument: Argument,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FixedDateTime:
        @classmethod
        def now(cls, tz: tzinfo | None = None) -> datetime:
            return datetime(2026, 5, 27, tzinfo=tz)

    monkeypatch.setattr("src.services.objection_service.datetime", FixedDateTime)

    project_id = create_test_argument.project_id
    beteiligungs_eingang = (
        await db_session.execute(
            select(BeteiligungsEingang).where(BeteiligungsEingang.id == create_test_argument.beteiligungs_eingang_id)
        )
    ).scalar_one()
    fake_dms = FakeDmsClient(
        [
            DmsFileMetadata(
                id=beteiligungs_eingang.file_id,
                type="ewms_document",
                filename="einwendung-mueller.pdf",
                projectId=project_id,
                projectVersion=1,
            )
        ]
    )

    result = await export_arguments_to_dms(
        project_id=project_id,
        db=db_session,
        dms_client=fake_dms,
        project_logic_client=FakeProjectLogicClient(
            [],
            project_name='Test/Projekt: "A"',
        ),
    )

    assert result.file_id == fake_dms.uploaded_file_id
    assert fake_dms.upload_calls[0][2] == "20260527_Synopse_Test_Projekt_ _A_.csv"


@pytest.mark.asyncio
async def test_import_arguments_from_dms_passes_project_version_to_dms(
    db_session: AsyncSession,
    create_test_argument: Argument,
) -> None:
    create_test_argument.argument_id = "A1-Einwendung_Mueller"
    create_test_argument.erwiderung = None
    await db_session.commit()

    project_id = create_test_argument.project_id
    import_file_id = uuid.uuid4()
    csv_content = "\n".join(
        [
            "argument id;erwiderung",
            "A1-Einwendung_Mueller;Neue Erwiderung",
        ]
    ).encode(CSV_ENCODING)
    fake_dms = FakeDmsClient(
        [
            DmsFileMetadata(
                id=import_file_id,
                type="erwiderungs_import",
                filename="erwiderungen.csv",
                projectId=project_id,
                projectVersion=1,
            )
        ],
        file_content=csv_content,
    )

    result = await import_arguments_from_dms(
        project_id=project_id,
        file_id=import_file_id,
        db=db_session,
        dms_client=fake_dms,
        project_logic_client=FakeProjectLogicClient([], latest_version=1),
    )

    await db_session.refresh(create_test_argument)

    assert result.updated == 1
    assert result.skipped == 0
    assert create_test_argument.erwiderung == "Neue Erwiderung"
    assert fake_dms.get_calls == [(import_file_id, 1)]
    assert fake_dms.download_calls == [(import_file_id, 1)]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("delimiter", "argument_id_header", "erwiderung_header"),
    [
        (";", "argument id", "erwiderung"),
        (",", "argument id", "erwiderung"),
        (";", "Argument-ID", "Erwiderung"),
    ],
)
async def test_import_arguments_csv_updates_by_business_argument_id(
    db_session: AsyncSession,
    create_test_argument: Argument,
    delimiter: str,
    argument_id_header: str,
    erwiderung_header: str,
) -> None:
    create_test_argument.argument_id = "A1-Einwendung_Mueller"
    create_test_argument.erwiderung = None
    other_project_id = uuid.uuid4()
    other_be = BeteiligungsEingang(
        id=uuid.uuid4(),
        project_id=other_project_id,
        beteiligung_typ=BeteiligungTyp.EINWENDUNG,
        file_id=uuid.uuid4(),
        extraction_status=ExtractionStatus.SUCCESS,
        classification_status=ClassificationStatus.DONE,
    )
    other_argument = Argument(
        id=uuid.uuid4(),
        project_id=other_project_id,
        beteiligungs_eingang_id=other_be.id,
        argument_id="A1-Einwendung_Mueller",
        status=ArgumentStatus.OPEN,
    )
    db_session.add_all([other_be, other_argument])
    await db_session.commit()

    csv_content = "\n".join(
        [
            f"{argument_id_header}{delimiter}{erwiderung_header}",
            f"A1-Einwendung_Mueller{delimiter}Neue Erwiderung",
            f"A2-Unknown{delimiter}Ignorieren",
            f"A3-Empty{delimiter}",
        ]
    ).encode(CSV_ENCODING)

    result = await import_arguments_csv(
        project_id=create_test_argument.project_id,
        file_content=csv_content,
        db=db_session,
        project_logic_client=FakeProjectLogicClient([]),
    )

    assert result == {"updated": 1, "skipped": 2}
    refreshed = (await db_session.execute(select(Argument).where(Argument.id == create_test_argument.id))).scalar_one()
    await db_session.refresh(refreshed)
    assert refreshed.erwiderung == "Neue Erwiderung"

    other_refreshed = (await db_session.execute(select(Argument).where(Argument.id == other_argument.id))).scalar_one()
    await db_session.refresh(other_refreshed)
    assert other_refreshed.erwiderung is None


@pytest.mark.asyncio
async def test_import_arguments_csv_updates_latest_version_only(
    db_session: AsyncSession,
    create_test_argument: Argument,
) -> None:
    create_test_argument.argument_id = "A1-Einwendung_Mueller"
    create_test_argument.erwiderung = None
    project_id = create_test_argument.project_id
    old_be = (
        await db_session.execute(
            select(BeteiligungsEingang).where(BeteiligungsEingang.id == create_test_argument.beteiligungs_eingang_id)
        )
    ).scalar_one()
    latest_be = BeteiligungsEingang(
        id=old_be.id,
        project_id=project_id,
        project_version=2,
        beteiligung_typ=old_be.beteiligung_typ,
        file_id=old_be.file_id,
        extraction_status=old_be.extraction_status,
        classification_status=old_be.classification_status,
    )
    latest_argument = Argument(
        id=create_test_argument.id,
        project_id=project_id,
        project_version=2,
        beteiligungs_eingang_id=old_be.id,
        argument_id="A1-Einwendung_Mueller",
        erwiderung=None,
        status=ArgumentStatus.OPEN,
    )
    db_session.add_all([latest_be, latest_argument])
    await db_session.commit()

    csv_content = "\n".join(
        [
            "argument id;erwiderung",
            "A1-Einwendung_Mueller;Neue Erwiderung",
        ]
    ).encode(CSV_ENCODING)

    result = await import_arguments_csv(
        project_id=project_id,
        file_content=csv_content,
        db=db_session,
        project_logic_client=FakeProjectLogicClient([], latest_version=2),
    )
    await db_session.refresh(create_test_argument)
    await db_session.refresh(latest_argument)

    assert result == {"updated": 1, "skipped": 0}
    assert create_test_argument.erwiderung is None
    assert latest_argument.erwiderung == "Neue Erwiderung"
