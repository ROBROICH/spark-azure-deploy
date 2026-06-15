"""Tests for document history / versioning."""

import pytest
from db_pipelines.schemas.db import (
    Absatz,
    AbsatzHistory,
    BaseAbsatz,
    BaseDocument,
    BaseNorm,
    BaseSatz,
    DocType,
    Document,
    DocumentHistory,
    Hierarchy,
    Norm,
    NormHistory,
    ParagraphTyp,
    Satz,
    SatzHistory,
)
from db_pipelines.workflows.update_rechtsgrundlage.activities import (
    ExistingException,
    UpdateRechtsgrundlageActivities,
)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import select


def _make_document(
    doknr: str = "BJNR000000001",
    jurabk: str = "TestG",
    builddate: str = "20260101",
    langue: str = "deutsch",
    content_hash: str | None = None,
    fundstelle: str = "BGBl I",
) -> Document:
    """Create a minimal Document for testing."""
    return Document(
        doknr=doknr,
        jurabk=jurabk,
        builddate=builddate,
        langue=langue,
        kurzue=langue,
        doktyp=DocType.GESETZ,
        hierarchy=Hierarchy.BUND,
        fundstelle=fundstelle,
        content_hash=content_hash,
    )


def _make_norm(
    jurabk: str = "TestG",
    paragraph_nr: int = 1,
    doknr: str = "BJNR000000001",
) -> Norm:
    """Create a minimal Norm for testing."""
    return Norm(
        jurabk=jurabk,
        paragraph_nr=paragraph_nr,
        sub_paragraph_nr="",
        doknr=doknr,
        titel=f"§ {paragraph_nr} {jurabk}",
        paragraph_text=f"Text of § {paragraph_nr}",
        paragraph_typ=ParagraphTyp.SINGLE,
    )


def _make_absatz(
    jurabk: str = "TestG",
    paragraph_nr: int = 1,
    absatz_nr: str = "1",
) -> Absatz:
    return Absatz(
        jurabk=jurabk,
        paragraph_nr=paragraph_nr,
        sub_paragraph_nr="",
        absatz_nr=absatz_nr,
        absatz_text=f"Absatz {absatz_nr} text",
    )


def _make_satz(
    jurabk: str = "TestG",
    paragraph_nr: int = 1,
    absatz_nr: str = "1",
    satz_id: int = 1,
) -> Satz:
    return Satz(
        jurabk=jurabk,
        paragraph_nr=paragraph_nr,
        sub_paragraph_nr="",
        absatz_nr=absatz_nr,
        satz_id=satz_id,
        satz_nr=1,
        satz_text=f"Satz {satz_id} text",
    )


def _make_full_document(fundstelle: str = "BGBl I") -> Document:
    """Document with one norm -> absatz -> satz, for child-archive coverage."""
    satz = _make_satz()
    absatz = _make_absatz()
    absatz.saetze = [satz]
    norm = _make_norm()
    norm.absaetze = [absatz]
    doc = _make_document(fundstelle=fundstelle)
    doc.normen = [norm]
    return doc


class TestHistoryModels:
    """History models have correct fields and inherit from base classes."""

    def test_document_history_inherits_base_fields(self):
        """DocumentHistory has all BaseDocument fields."""
        base_fields = set(BaseDocument.model_fields.keys())
        history_fields = set(DocumentHistory.model_fields.keys())
        assert base_fields.issubset(history_fields)

    def test_document_history_has_version_and_archived_at(self):
        assert "version" in DocumentHistory.model_fields
        assert "archived_at" in DocumentHistory.model_fields

    def test_document_history_has_relationships(self):
        """History models should have relationship fields."""
        relationships = DocumentHistory.__sqlmodel_relationships__
        assert "normen" in relationships

    def test_norm_history_inherits_base_fields(self):
        base_fields = set(BaseNorm.model_fields.keys())
        history_fields = set(NormHistory.model_fields.keys())
        assert base_fields.issubset(history_fields)

    def test_norm_history_has_version(self):
        assert "version" in NormHistory.model_fields

    def test_norm_history_has_relationships(self):
        relationships = NormHistory.__sqlmodel_relationships__
        assert "absaetze" in relationships
        assert "document" in relationships

    def test_absatz_history_inherits_base_fields(self):
        base_fields = set(BaseAbsatz.model_fields.keys())
        history_fields = set(AbsatzHistory.model_fields.keys())
        assert base_fields.issubset(history_fields)

    def test_absatz_history_has_version(self):
        assert "version" in AbsatzHistory.model_fields

    def test_absatz_history_has_relationships(self):
        relationships = AbsatzHistory.__sqlmodel_relationships__
        assert "saetze" in relationships
        assert "source_norm" in relationships

    def test_satz_history_inherits_base_fields(self):
        base_fields = set(BaseSatz.model_fields.keys())
        history_fields = set(SatzHistory.model_fields.keys())
        assert base_fields.issubset(history_fields)

    def test_satz_history_has_version(self):
        assert "version" in SatzHistory.model_fields

    def test_satz_history_has_relationships(self):
        relationships = SatzHistory.__sqlmodel_relationships__
        assert "absatz" in relationships

    def test_document_history_tablename(self):
        assert DocumentHistory.__tablename__ == "documents_history"

    def test_norm_history_tablename(self):
        assert NormHistory.__tablename__ == "norm_history"

    def test_absatz_history_tablename(self):
        assert AbsatzHistory.__tablename__ == "absatz_history"

    def test_satz_history_tablename(self):
        assert SatzHistory.__tablename__ == "satz_history"


class TestContentHash:
    """Document.compute_content_hash produces stable, content-based hashes."""

    def test_same_content_same_hash(self):
        doc1 = _make_document()
        doc2 = _make_document()
        assert Document.compute_content_hash(doc1) == Document.compute_content_hash(doc2)

    def test_different_content_different_hash(self):
        doc1 = _make_document(fundstelle="BGBl I")
        doc2 = _make_document(fundstelle="BGBl II")
        assert Document.compute_content_hash(doc1) != Document.compute_content_hash(doc2)

    def test_builddate_not_in_hash(self):
        """builddate is volatile and must not affect the hash."""
        doc1 = _make_document(builddate="20260101")
        doc2 = _make_document(builddate="20260401")
        assert Document.compute_content_hash(doc1) == Document.compute_content_hash(doc2)

    def test_hash_includes_norms(self):
        doc1 = _make_document()
        doc2 = _make_document()
        doc2.normen = [_make_norm(paragraph_nr=1)]
        assert Document.compute_content_hash(doc1) != Document.compute_content_hash(doc2)


class TestWriteDocumentToDb:
    """UpdateRechtsgrundlageActivities._write_document_to_db archives and updates.

    Exercises the same async write path the Temporal ``parse_norm`` activity
    uses, against the migrated Postgres test database (so Satz ARRAY columns
    archive correctly, unlike under SQLite).
    """

    @pytest.fixture
    def sessionmaker(self, db_engine):
        return async_sessionmaker(bind=db_engine, class_=AsyncSession, expire_on_commit=False)

    @pytest.fixture
    def activities(self, sessionmaker):
        return UpdateRechtsgrundlageActivities(sessionmaker)

    async def test_new_document_inserted(self, activities, sessionmaker):
        """New documents are inserted with a computed content_hash."""
        await activities._write_document_to_db(_make_document())

        async with sessionmaker() as session:
            result = (await session.execute(select(Document))).all()
            assert len(result) == 1
            assert result[0][0].jurabk == "TestG"
            assert result[0][0].content_hash is not None

    async def test_no_history_for_first_insert(self, activities, sessionmaker):
        """First insert should not create any history."""
        await activities._write_document_to_db(_make_document())

        async with sessionmaker() as session:
            assert (await session.execute(select(DocumentHistory))).all() == []

    async def test_duplicate_content_skipped(self, activities):
        """Identical content (volatile builddate aside) raises ExistingException."""
        await activities._write_document_to_db(_make_document())
        with pytest.raises(ExistingException):
            await activities._write_document_to_db(_make_document(builddate="20260401"))

    async def test_existing_document_archived_and_updated(self, activities, sessionmaker):
        """When a document already exists, the old version goes to history and live is updated."""
        await activities._write_document_to_db(_make_document(fundstelle="BGBl I 2026, 1"))
        async with sessionmaker() as session:
            v1_hash = (await session.execute(select(Document))).scalar_one().content_hash

        await activities._write_document_to_db(_make_document(fundstelle="BGBl I 2026, 42"))

        async with sessionmaker() as session:
            live = (await session.execute(select(Document))).all()
            assert len(live) == 1
            assert live[0][0].fundstelle == "BGBl I 2026, 42"

            history = (await session.execute(select(DocumentHistory))).all()
            assert len(history) == 1
            assert history[0][0].version == v1_hash
            assert history[0][0].archived_at is not None

    async def test_multiple_updates_create_multiple_history_entries(self, activities, sessionmaker):
        """Each content change creates a new history entry keyed by content hash."""
        await activities._write_document_to_db(_make_document(fundstelle="BGBl I 2025, 1"))
        await activities._write_document_to_db(_make_document(fundstelle="BGBl I 2026, 1"))
        await activities._write_document_to_db(_make_document(fundstelle="BGBl I 2026, 42"))

        async with sessionmaker() as session:
            live = (await session.execute(select(Document))).all()
            assert len(live) == 1
            assert live[0][0].fundstelle == "BGBl I 2026, 42"

            history = (await session.execute(select(DocumentHistory))).all()
            assert len(history) == 2
            for (entry,) in history:
                assert len(entry.version) == 64

    async def test_update_archives_children(self, activities, sessionmaker):
        """Archiving a document also copies its norm/absatz/satz rows to history."""
        await activities._write_document_to_db(_make_full_document(fundstelle="BGBl I 2025, 1"))
        await activities._write_document_to_db(_make_full_document(fundstelle="BGBl I 2026, 42"))

        async with sessionmaker() as session:
            assert len((await session.execute(select(DocumentHistory))).all()) == 1
            assert len((await session.execute(select(NormHistory))).all()) == 1
            assert len((await session.execute(select(AbsatzHistory))).all()) == 1
            assert len((await session.execute(select(SatzHistory))).all()) == 1

    async def test_legacy_null_hash_identical_content_skipped(self, activities, sessionmaker):
        """A pre-migration row (content_hash=NULL) with unchanged content is skipped.

        The missing hash is recomputed from the stored document and compared
        against the incoming one, so no spurious history entry is created.
        """
        async with sessionmaker() as session:
            session.add(_make_document(content_hash=None, fundstelle="BGBl I 2026, 1"))
            await session.commit()

        with pytest.raises(ExistingException):
            await activities._write_document_to_db(
                _make_document(builddate="20260601", fundstelle="BGBl I 2026, 1")
            )

        async with sessionmaker() as session:
            assert (await session.execute(select(DocumentHistory))).all() == []

    async def test_legacy_null_hash_changed_content_archived(self, activities, sessionmaker):
        """A pre-migration row (content_hash=NULL) with changed content is archived.

        The recomputed hash becomes the history version even though the live row
        never stored a content_hash.
        """
        async with sessionmaker() as session:
            session.add(_make_document(content_hash=None, fundstelle="BGBl I 2025, 1"))
            await session.commit()

        await activities._write_document_to_db(_make_document(fundstelle="BGBl I 2026, 42"))

        async with sessionmaker() as session:
            live = (await session.execute(select(Document))).all()
            assert len(live) == 1
            assert live[0][0].fundstelle == "BGBl I 2026, 42"
            assert live[0][0].content_hash is not None

            history = (await session.execute(select(DocumentHistory))).all()
            assert len(history) == 1
            assert len(history[0][0].version) == 64

    async def test_rearchiving_same_content_raises(self, activities):
        """Re-archiving a content version already in history raises ExistingException.

        Cycling content A -> B -> A -> B archives A's hash a second time, which
        collides with the existing (doknr, version) history row. The resulting
        IntegrityError must surface as ExistingException rather than crashing.
        """
        await activities._write_document_to_db(_make_document(fundstelle="A"))
        await activities._write_document_to_db(_make_document(fundstelle="B"))
        await activities._write_document_to_db(_make_document(fundstelle="A"))

        with pytest.raises(ExistingException):
            await activities._write_document_to_db(_make_document(fundstelle="B"))
