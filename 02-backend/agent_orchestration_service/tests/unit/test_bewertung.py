from itertools import count
from typing import Any
from uuid import UUID, uuid4

import pytest
from temporal.workflows.bewertung.types import (
    BewertungsWorkflowOutput,
    KapitelOutput,
    Quelle,
)
from temporal.workflows.modul_suche_und_zuordnung.types import (
    PageIndexSVMEntry,
)
from temporal.workflows.rechtsmethodik.types import (
    AtomaresTBM,
    Rechtsbegriffe,
    Rechtsfolge,
    Verweise,
)

from src.workflows.bewertung.input_builder import build_satz_inputs
from src.workflows.bewertung.insert import (
    InsertBewertungResultsWorkflow,
    WriteBewertungSatzInput,
    _write_bewertung_satz_result,
)
from src.workflows.bewertung.mapper import map_bewertung_result
from src.workflows.bewertung.orchestrator import _has_fundstellen
from src.workflows.bewertung.types import (
    FundstelleContext,
    InsertBewertungInput,
    NormContext,
    SatzContext,
)
from src.workflows.insert_suche_zuordnung_results.mapper import map_fundstellen
from src.workflows.result_insertion import delete_stale_bewertungen_for_satz

# Expected node counts for a fully-populated bewertung output (2 kapitel, 2 quellen)
EXPECTED_KAPITEL_COUNT = 2
EXPECTED_QUELLE_COUNT = 2
# 1 markdown_text + 1 bewertung + 2 kapitel + 2 quellen
EXPECTED_TOTAL_INSERT_COUNT = 6
# 1 markdown_text + 1 bewertung + 2 kapitel (no quellen)
EXPECTED_INSERT_COUNT_WITHOUT_QUELLEN = 4
# bewertung + markdown_text + kapitel + quelle deleted together
EXPECTED_STALE_DELETE_COUNT = 4


@pytest.fixture(autouse=True)
def patch_workflow_uuid(monkeypatch: pytest.MonkeyPatch) -> None:
    """Replace workflow.uuid4() with a deterministic counter so mappers are testable
    outside a real Temporal runtime."""
    counter = count()
    monkeypatch.setattr(
        "temporalio.workflow.uuid4",
        lambda: UUID(int=next(counter)),
    )

    async def mock_list_nodes(project_id: UUID) -> dict[str, list[Any]]:
        return {"nodes": []}

    monkeypatch.setattr(
        "src.workflows.result_insertion.ExaminationServiceClient.list_nodes",
        mock_list_nodes,
    )


# =============================================================================
# Fixtures
# =============================================================================


def _make_verweise() -> Verweise:
    return Verweise(explizit=[], implizit=[])


def _make_rechtsbegriffe() -> Rechtsbegriffe:
    return Rechtsbegriffe(unbestimmte_rechtsbegriffe=[], bestimmte_rechtsbegriffe=[])


def _make_atomares_tbm(**overrides: Any) -> AtomaresTBM:
    defaults: dict[str, Any] = {
        "id": uuid4(),
        "text": "Tatbestandsmerkmal Text",
        "verweise": _make_verweise(),
        "prueffrage": "Ist die Voraussetzung erfüllt?",
        "pruefgegenstand": "Prüfgegenstand",
        "rechtsbegriffe": _make_rechtsbegriffe(),
    }
    return AtomaresTBM(**(defaults | overrides))


def _make_rechtsfolge(**overrides: Any) -> Rechtsfolge:
    defaults: dict[str, Any] = {
        "text": "Rechtsfolge Text",
        "sollensanordnungen": "verbot",
        "rechtsfolgen_adressat": "handlungsermächtigung",
    }
    return Rechtsfolge(**(defaults | overrides))


def _make_fundstelle_context(**overrides: Any) -> FundstelleContext:
    defaults: dict[str, Any] = {
        "id": str(uuid4()),
        "dokument_id": str(uuid4()),
        "title": "Fundstelle Titel",
        "text": "Fundstelle Text",
        "chunk_ids": [str(uuid4())],
        "page_numbers": [1, 2],
    }
    return FundstelleContext(**(defaults | overrides))


def _make_satz_context(**overrides: Any) -> SatzContext:
    defaults: dict[str, Any] = {
        "satz_id": str(uuid4()),
        "satz_text": "Der Satz Text.",
        "norm_typ_lvl_1": "materiell-rechtlich",
        "norm_typ_lvl_2": "wenn-dann",
        "atomare_tbm": [_make_atomares_tbm()],
        "rechtsfolge": _make_rechtsfolge(),
        "fundstellen": [_make_fundstelle_context(), _make_fundstelle_context()],
    }
    return SatzContext(**(defaults | overrides))


def _make_norm_context(**overrides: Any) -> NormContext:
    defaults: dict[str, Any] = {
        "gesetz_name": "Bundesnaturschutzgesetz",
        "jurabk": "BNatSchG",
        "paragraph_nr": "44",
        "paragraph_titel": "Vorschriften für besonders geschützte Tierarten",
        "paragraph_text": "Volltext des Paragraphen.",
        "saetze": [_make_satz_context(), _make_satz_context()],
    }
    return NormContext(**(defaults | overrides))


def _make_kapitel_output(**overrides: Any) -> KapitelOutput:
    defaults: dict[str, Any] = {
        "id": str(uuid4()),
        "titel": "Kapitel 1",
        "markdown": "## Kapitel 1\n\nInhalt",
        "kurzform": "Kurzform Kapitel 1",
    }
    return KapitelOutput(**(defaults | overrides))


def _make_quelle(**overrides: Any) -> Quelle:
    defaults: dict[str, Any] = {
        "document_id": str(uuid4()),
        "node_id": str(uuid4()),
        "title": "Quelle Titel",
        "chunk_ids": [str(uuid4())],
        "page_numbers": [3, 4],
    }
    return Quelle(**(defaults | overrides))


def _make_bewertungs_output(**overrides: Any) -> BewertungsWorkflowOutput:
    q1 = _make_quelle()
    q2 = _make_quelle()
    defaults: dict[str, Any] = {
        "id": str(uuid4()),
        "satz_id": str(uuid4()),
        "norm": "§ 44 BNatSchG",
        "satz_text": "Der Satz Text.",
        "result": "erfuellt",
        "kurzform": "Das TBM ist erfüllt.",
        "kapitel": [_make_kapitel_output(), _make_kapitel_output(titel="Kapitel 2")],
        "full_text": "## Kapitel 1\n\nInhalt\n\n## Kapitel 2\n\nInhalt",
        "sources": {"0001": q1, "0002": q2},
    }
    return BewertungsWorkflowOutput(**(defaults | overrides))


# =============================================================================
# Tests for the mapper module
# =============================================================================


class TestMapBewertungResult:
    def test_returns_correct_node_types(self) -> None:
        output = _make_bewertungs_output()
        satz_id = str(uuid4())

        _, inserts = map_bewertung_result(output, satz_id)

        node_types = [i["node_type"] for i in inserts]
        assert node_types.count("markdown_text") == 1
        assert node_types.count("bewertung") == 1
        assert node_types.count("bewertung_kapitel") == EXPECTED_KAPITEL_COUNT
        assert node_types.count("bewertung_quelle") == EXPECTED_QUELLE_COUNT

    def test_total_insert_count(self) -> None:
        output = _make_bewertungs_output()
        _, inserts = map_bewertung_result(output, str(uuid4()))

        assert len(inserts) == EXPECTED_TOTAL_INSERT_COUNT

    def test_bewertung_payload_fields(self) -> None:
        satz_id = str(uuid4())
        output = _make_bewertungs_output(result="nicht_erfuellt", kurzform="Nicht erfüllt.")

        bewertung_id, inserts = map_bewertung_result(output, satz_id)

        bewertung = next(i for i in inserts if i["node_type"] == "bewertung")
        assert bewertung["payload"]["satz_id"] == satz_id
        assert bewertung["payload"]["result"] == "nicht_erfuellt"
        assert bewertung["payload"]["kurzform"] == "Nicht erfüllt."
        assert bewertung["payload"]["norm"] == output.norm
        assert bewertung["id"] == output.id
        assert bewertung_id == output.id

    def test_markdown_text_linked_to_bewertung(self) -> None:
        output = _make_bewertungs_output()
        _, inserts = map_bewertung_result(output, str(uuid4()))

        md = next(i for i in inserts if i["node_type"] == "markdown_text")
        bew = next(i for i in inserts if i["node_type"] == "bewertung")
        assert bew["payload"]["markdown_text_id"] == md["id"]
        assert md["payload"]["text"] == output.full_text

    def test_kapitel_linked_to_bewertung_with_order(self) -> None:
        output = _make_bewertungs_output()
        _, inserts = map_bewertung_result(output, str(uuid4()))

        bew = next(i for i in inserts if i["node_type"] == "bewertung")
        kapitels = [i for i in inserts if i["node_type"] == "bewertung_kapitel"]

        for k in kapitels:
            assert k["payload"]["bewertung_id"] == bew["id"]

        orders = [k["payload"]["order"] for k in kapitels]
        assert orders == [0, 1]

    def test_quellen_linked_to_bewertung(self) -> None:
        q1 = _make_quelle(document_id="doc-1", node_id="fs-1")
        q2 = _make_quelle(document_id="doc-2", node_id="fs-2")
        output = _make_bewertungs_output(sources={"0001": q1, "0002": q2})

        _, inserts = map_bewertung_result(output, str(uuid4()))

        bew = next(i for i in inserts if i["node_type"] == "bewertung")
        quellen = [i for i in inserts if i["node_type"] == "bewertung_quelle"]

        assert len(quellen) == EXPECTED_QUELLE_COUNT
        for q in quellen:
            assert q["payload"]["bewertung_id"] == bew["id"]

        dok_ids = {q["payload"]["dokument_id"] for q in quellen}
        assert dok_ids == {"doc-1", "doc-2"}
        cited_svm_ids = {q["payload"]["cited_svm_id"] for q in quellen}
        assert cited_svm_ids == {"0001", "0002"}
        quelle_ids = {q["id"] for q in quellen}
        assert len(quelle_ids) == EXPECTED_QUELLE_COUNT

    def test_quelle_with_none_node_id(self) -> None:
        q = _make_quelle(node_id="")
        output = _make_bewertungs_output(sources={"0001": q})

        _, inserts = map_bewertung_result(output, str(uuid4()))

        quelle = next(i for i in inserts if i["node_type"] == "bewertung_quelle")
        assert quelle["payload"]["fundstelle_id"] is None

    def test_empty_sources(self) -> None:
        output = _make_bewertungs_output(sources={})
        _, inserts = map_bewertung_result(output, str(uuid4()))

        quellen = [i for i in inserts if i["node_type"] == "bewertung_quelle"]
        assert quellen == []
        assert len(inserts) == EXPECTED_INSERT_COUNT_WITHOUT_QUELLEN

    def test_empty_kapitel(self) -> None:
        output = _make_bewertungs_output(kapitel=[])
        _, inserts = map_bewertung_result(output, str(uuid4()))

        kapitels = [i for i in inserts if i["node_type"] == "bewertung_kapitel"]
        assert kapitels == []

    def test_deterministic_given_same_workflow_uuid_sequence(self, monkeypatch: pytest.MonkeyPatch) -> None:
        output = _make_bewertungs_output()
        satz_id = str(uuid4())

        def reset_counter() -> None:
            counter = count()
            monkeypatch.setattr(
                "temporalio.workflow.uuid4",
                lambda: UUID(int=next(counter)),
            )

        reset_counter()
        _, first = map_bewertung_result(output, satz_id)
        reset_counter()
        _, second = map_bewertung_result(output, satz_id)

        assert [i["id"] for i in first] == [i["id"] for i in second]


# =============================================================================
# Tests for the input_builder module
# =============================================================================


class TestBuildSatzInputs:
    def test_one_input_per_satz(self) -> None:
        ctx = _make_norm_context()
        inputs = build_satz_inputs(ctx)

        assert len(inputs) == len(ctx.saetze)

    def test_norm_fields_mapped_correctly(self) -> None:
        ctx = _make_norm_context()
        inputs = build_satz_inputs(ctx)

        for inp in inputs:
            assert inp.gesetz == ctx.gesetz_name
            assert inp.jurabk == ctx.jurabk
            assert inp.paragraph_nr == ctx.paragraph_nr
            assert inp.paragraph_title == ctx.paragraph_titel
            assert inp.paragraph_text == ctx.paragraph_text

    def test_satz_fields_mapped_correctly(self) -> None:
        satz = _make_satz_context(satz_id="satz-123", satz_text="Test satz text")
        ctx = _make_norm_context(saetze=[satz])
        inputs = build_satz_inputs(ctx)

        assert len(inputs) == 1
        assert inputs[0].satz_id == "satz-123"
        assert inputs[0].satz_text == "Test satz text"

    def test_fundstellen_mapped_to_originaltexte(self) -> None:
        fs = _make_fundstelle_context(
            id="fs-1",
            dokument_id="dok-1",
            title="Title",
            text="Text",
            chunk_ids=["c1", "c2"],
            page_numbers=[5, 6],
        )
        satz = _make_satz_context(fundstellen=[fs])
        ctx = _make_norm_context(saetze=[satz])
        inputs = build_satz_inputs(ctx)

        ot = inputs[0].originaltexte[0]
        assert ot.node_id == "fs-1"
        assert ot.document_id == "dok-1"
        assert ot.title == "Title"
        assert ot.text == "Text"
        assert ot.chunk_ids == ["c1", "c2"]
        assert ot.page_numbers == [5, 6]

    def test_rechtsfolge_and_tbm_passed_through(self) -> None:
        tbm = _make_atomares_tbm(text="TBM text")
        rf = _make_rechtsfolge(text="RF text")
        satz = _make_satz_context(atomare_tbm=[tbm], rechtsfolge=rf)
        ctx = _make_norm_context(saetze=[satz])
        inputs = build_satz_inputs(ctx)

        assert inputs[0].atomare_tbm is not None
        assert inputs[0].atomare_tbm[0].text == "TBM text"
        assert inputs[0].rechtsfolge is not None
        assert inputs[0].rechtsfolge.text == "RF text"

    def test_research_report_is_none(self) -> None:
        ctx = _make_norm_context()
        inputs = build_satz_inputs(ctx)

        for inp in inputs:
            assert inp.research_report is None

    def test_empty_saetze_returns_empty(self) -> None:
        ctx = _make_norm_context(saetze=[])
        assert build_satz_inputs(ctx) == []

    def test_satz_without_fundstellen_is_skipped(self) -> None:
        satz = _make_satz_context(fundstellen=[])
        ctx = _make_norm_context(saetze=[satz])
        inputs = build_satz_inputs(ctx)

        assert inputs == []

    def test_satz_without_rechtsfolge(self) -> None:
        satz = _make_satz_context(rechtsfolge=None)
        ctx = _make_norm_context(saetze=[satz])
        inputs = build_satz_inputs(ctx)

        assert inputs[0].rechtsfolge is None

    def test_satz_with_wrong_norm_typ_lvl_1_is_skipped(self) -> None:
        satz = _make_satz_context(norm_typ_lvl_1="verfahrensrechtlich")
        ctx = _make_norm_context(saetze=[satz])
        assert build_satz_inputs(ctx) == []

    def test_satz_with_wrong_norm_typ_lvl_2_is_skipped(self) -> None:
        satz = _make_satz_context(norm_typ_lvl_2="sonstiges")
        ctx = _make_norm_context(saetze=[satz])
        assert build_satz_inputs(ctx) == []

    def test_satz_with_none_norm_typ_is_skipped(self) -> None:
        satz = _make_satz_context(norm_typ_lvl_1=None, norm_typ_lvl_2=None)
        ctx = _make_norm_context(saetze=[satz])
        assert build_satz_inputs(ctx) == []

    def test_only_materiell_wenn_dann_saetze_included(self) -> None:
        matching = _make_satz_context(norm_typ_lvl_1="materiell-rechtlich", norm_typ_lvl_2="wenn-dann")
        non_matching = _make_satz_context(norm_typ_lvl_1="verfahrensrechtlich", norm_typ_lvl_2="wenn-dann")
        ctx = _make_norm_context(saetze=[matching, non_matching])
        inputs = build_satz_inputs(ctx)
        assert len(inputs) == 1


# =============================================================================
# Tests: orchestrator.py — _has_fundstellen helper
# =============================================================================


class TestHasFundstellen:
    def test_true_when_at_least_one_satz_has_fundstellen(self) -> None:
        ctx = _make_norm_context(
            saetze=[
                _make_satz_context(fundstellen=[_make_fundstelle_context()]),
                _make_satz_context(fundstellen=[]),
            ]
        )
        assert _has_fundstellen(ctx) is True

    def test_false_when_no_satz_has_fundstellen(self) -> None:
        ctx = _make_norm_context(
            saetze=[
                _make_satz_context(fundstellen=[]),
                _make_satz_context(fundstellen=[]),
            ]
        )
        assert _has_fundstellen(ctx) is False

    def test_false_when_no_saetze(self) -> None:
        ctx = _make_norm_context(saetze=[])
        assert _has_fundstellen(ctx) is False

    def test_true_when_all_saetze_have_fundstellen(self) -> None:
        ctx = _make_norm_context(
            saetze=[
                _make_satz_context(fundstellen=[_make_fundstelle_context()]),
                _make_satz_context(fundstellen=[_make_fundstelle_context(), _make_fundstelle_context()]),
            ]
        )
        assert _has_fundstellen(ctx) is True


# =============================================================================
# Tests for the insert module (InsertBewertungResultsWorkflow, monkeypatched)
# =============================================================================


class TestInsertBewertungResultsWorkflow:
    @pytest.mark.asyncio
    async def test_empty_satz_outputs_returns_early(self) -> None:
        result = await InsertBewertungResultsWorkflow().run(InsertBewertungInput(project_id=uuid4(), satz_outputs=[]))
        assert result.satz_results == []


def _build_write_input(
    project_id: UUID,
    output: BewertungsWorkflowOutput,
    sources_override: dict[str, Quelle] | None = None,
) -> WriteBewertungSatzInput:
    """Build a WriteBewertungSatzInput as if the workflow had mapped the bewertung output."""
    if sources_override is not None:
        output = _make_bewertungs_output(sources=sources_override)
    bewertung_id, inserts = map_bewertung_result(output, "satz-1")
    return WriteBewertungSatzInput(
        project_id=project_id,
        satz_id="satz-1",
        bewertung_id=bewertung_id,
        inserts=inserts,
    )


class TestWriteBewertungSatzActivity:
    @pytest.mark.asyncio
    async def test_missing_fundstelle_is_nullified_before_insert(self, monkeypatch: pytest.MonkeyPatch) -> None:
        output = _make_bewertungs_output(
            sources={"0001": _make_quelle(document_id="doc-1", node_id="missing-fundstelle")}
        )
        write_input = _build_write_input(uuid4(), output)
        write_calls: list[list[dict[str, Any]]] = []

        async def mock_batch_get_nodes(
            project_id: UUID, nodes: list[dict[str, Any]]
        ) -> dict[str, list[dict[str, Any]]]:
            dokument_refs = [n for n in nodes if n["node_type"] == "dokument"]
            if dokument_refs:
                return {"results": [{"id": "doc-1", "node_type": "dokument"}]}
            return {"results": []}

        async def mock_update_nodes(
            project_id: UUID,
            inserts: list[dict[str, Any]],
            updates: list[dict[str, Any]] | None = None,
            deletes: list[dict[str, Any]] | None = None,
        ) -> dict[str, Any]:
            write_calls.append(inserts)
            return {"inserted": inserts}

        monkeypatch.setattr(
            "src.workflows.result_insertion.ExaminationServiceClient.batch_get_nodes",
            mock_batch_get_nodes,
        )
        monkeypatch.setattr(
            "src.workflows.result_insertion.ExaminationServiceClient.update_nodes",
            mock_update_nodes,
        )

        result = await _write_bewertung_satz_result(write_input)

        quelle = next(insert for insert in write_calls[0] if insert["node_type"] == "bewertung_quelle")
        assert quelle["payload"]["fundstelle_id"] is None
        assert result.skipped is False

    @pytest.mark.asyncio
    async def test_missing_dokument_skips_quelle_insert(self, monkeypatch: pytest.MonkeyPatch) -> None:
        output = _make_bewertungs_output(
            sources={"0001": _make_quelle(document_id="missing-doc", node_id="fundstelle-1")}
        )
        write_input = _build_write_input(uuid4(), output)
        write_calls: list[list[dict[str, Any]]] = []

        async def mock_batch_get_nodes(
            project_id: UUID, nodes: list[dict[str, Any]]
        ) -> dict[str, list[dict[str, Any]]]:
            results: list[dict[str, Any]] = []
            for node in nodes:
                if node["node_type"] == "fundstelle" and node["id"] == "fundstelle-1":
                    results.append({"id": "fundstelle-1", "node_type": "fundstelle"})
            return {"results": results}

        async def mock_update_nodes(
            project_id: UUID,
            inserts: list[dict[str, Any]],
            updates: list[dict[str, Any]] | None = None,
            deletes: list[dict[str, Any]] | None = None,
        ) -> dict[str, Any]:
            write_calls.append(inserts)
            return {"inserted": inserts}

        monkeypatch.setattr(
            "src.workflows.result_insertion.ExaminationServiceClient.batch_get_nodes",
            mock_batch_get_nodes,
        )
        monkeypatch.setattr(
            "src.workflows.result_insertion.ExaminationServiceClient.update_nodes",
            mock_update_nodes,
        )

        await _write_bewertung_satz_result(write_input)

        assert [insert["node_type"] for insert in write_calls[0]].count("bewertung_quelle") == 0

    @pytest.mark.asyncio
    async def test_precheck_hit_skips_write_when_all_expected_nodes_exist(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        output = _make_bewertungs_output(sources={})
        write_input = _build_write_input(uuid4(), output)
        write_calls: list[list[dict[str, Any]]] = []

        async def mock_batch_get_nodes(
            project_id: UUID, nodes: list[dict[str, Any]]
        ) -> dict[str, list[dict[str, Any]]]:
            return {"results": [{"id": node["id"], "node_type": node["node_type"]} for node in nodes]}

        async def mock_update_nodes(
            project_id: UUID,
            inserts: list[dict[str, Any]],
            updates: list[dict[str, Any]] | None = None,
            deletes: list[dict[str, Any]] | None = None,
        ) -> dict[str, Any]:
            write_calls.append(inserts)
            return {"inserted": inserts}

        monkeypatch.setattr(
            "src.workflows.result_insertion.ExaminationServiceClient.batch_get_nodes",
            mock_batch_get_nodes,
        )
        monkeypatch.setattr(
            "src.workflows.result_insertion.ExaminationServiceClient.update_nodes",
            mock_update_nodes,
        )

        result = await _write_bewertung_satz_result(write_input)

        assert write_calls == []
        assert result.skipped is False
        assert result.nodes_inserted == EXPECTED_INSERT_COUNT_WITHOUT_QUELLEN

    @pytest.mark.asyncio
    async def test_precheck_miss_calls_write_with_full_insert_set(self, monkeypatch: pytest.MonkeyPatch) -> None:
        output = _make_bewertungs_output(sources={})
        write_input = _build_write_input(uuid4(), output)
        write_calls: list[list[dict[str, Any]]] = []

        async def mock_batch_get_nodes(
            project_id: UUID, nodes: list[dict[str, Any]]
        ) -> dict[str, list[dict[str, Any]]]:
            return {"results": []}

        async def mock_update_nodes(
            project_id: UUID,
            inserts: list[dict[str, Any]],
            updates: list[dict[str, Any]] | None = None,
            deletes: list[dict[str, Any]] | None = None,
        ) -> dict[str, Any]:
            write_calls.append(inserts)
            return {"inserted": inserts}

        monkeypatch.setattr(
            "src.workflows.result_insertion.ExaminationServiceClient.batch_get_nodes",
            mock_batch_get_nodes,
        )
        monkeypatch.setattr(
            "src.workflows.result_insertion.ExaminationServiceClient.update_nodes",
            mock_update_nodes,
        )

        result = await _write_bewertung_satz_result(write_input)

        assert len(write_calls) == 1
        assert len(write_calls[0]) == EXPECTED_INSERT_COUNT_WITHOUT_QUELLEN
        assert result.nodes_inserted == EXPECTED_INSERT_COUNT_WITHOUT_QUELLEN


# =============================================================================
# Tests: SuZ → Bewertung round-trip (mapper → gather-like grouping → input_builder)
# =============================================================================


def _make_page_index_svm_entry(**overrides: Any) -> PageIndexSVMEntry:
    defaults: dict[str, Any] = {
        "node_id": str(uuid4()),
        "document_id": str(uuid4()),
        "title": "C 5.2 Quantifizierung der Vorhabenswirkung",
        "text": "Insgesamt werden 3.312 m² dauerhaft durch bauliche Anlagen in Anspruch genommen.",
        "chunk_ids": [str(uuid4()), str(uuid4())],
        "page_numbers": [16, 17],
    }
    return PageIndexSVMEntry(**(defaults | overrides))


class TestSuzToBewertungRoundTrip:
    """Verify that Fundstellen inserted by SuZ mapper can be read back by Bewertung's gather/input_builder."""

    @pytest.fixture()
    def originaltexte(self) -> list[PageIndexSVMEntry]:
        return [
            _make_page_index_svm_entry(title="Kapitel A", page_numbers=[1, 2]),
            _make_page_index_svm_entry(title="Kapitel B", page_numbers=[3]),
            _make_page_index_svm_entry(title="Kapitel C", page_numbers=[5, 6, 7]),
        ]

    def test_map_fundstellen_produces_valid_payloads(self, originaltexte: list[PageIndexSVMEntry]) -> None:
        satz_id = str(uuid4())
        gesetz_id = str(uuid4())
        norm_id = str(uuid4())

        inserts = map_fundstellen(
            originaltexte,
            chunk_to_dokument={},
            dms_to_dokument={entry.document_id: str(uuid4()) for entry in originaltexte},
            satz_id=satz_id,
            gesetz_id=gesetz_id,
            norm_id=norm_id,
        )

        assert len(inserts) == len(originaltexte)
        for ins in inserts:
            assert ins["node_type"] == "fundstelle"
            assert ins["payload"]["satz_id"] == satz_id
            assert ins["payload"]["gesetz_id"] == gesetz_id
            assert ins["payload"]["norm_id"] == norm_id
            assert "title" in ins["payload"]
            assert "text" in ins["payload"]
            assert "page_numbers" in ins["payload"]
            assert "chunk_ids" in ins["payload"]

    def test_round_trip_suz_insert_to_bewertung_input(self, originaltexte: list[PageIndexSVMEntry]) -> None:
        """Simulate: SuZ inserts → examination service stores → gather reads → build_satz_inputs produces Originaltexte."""
        satz_id = str(uuid4())
        gesetz_id = str(uuid4())
        norm_id = str(uuid4())
        dokument_id = str(uuid4())

        # Build chunk_to_dokument mapping (all chunks → same document)
        chunk_to_dokument = {cid: dokument_id for entry in originaltexte for cid in entry.chunk_ids if cid}

        # Step 1: SuZ mapper produces insert payloads
        inserts = map_fundstellen(
            originaltexte,
            chunk_to_dokument,
            {},
            satz_id=satz_id,
            gesetz_id=gesetz_id,
            norm_id=norm_id,
        )

        # Step 2: Simulate what examination service returns for batch_get_nodes
        stored_fundstellen = [{"id": ins["id"], "node_type": "fundstelle", **ins["payload"]} for ins in inserts]

        # Step 3: Simulate gather's _group_by(fundstellen, "satz_id")
        fundstellen_by_satz: dict[str, list[dict[str, Any]]] = {}
        for fs in stored_fundstellen:
            key = fs.get("satz_id")
            if key:
                fundstellen_by_satz.setdefault(str(key), []).append(fs)

        assert satz_id in fundstellen_by_satz
        assert len(fundstellen_by_satz[satz_id]) == len(originaltexte)

        # Step 4: Simulate gather's FundstelleContext construction
        typed_fundstellen = [
            FundstelleContext(
                id=str(fs["id"]),
                dokument_id=str(fs["dokument_id"]),
                title=fs.get("title", ""),
                text=fs.get("text", ""),
                chunk_ids=[str(c) for c in fs.get("chunk_ids", [])],
                page_numbers=fs.get("page_numbers", []),
            )
            for fs in fundstellen_by_satz[satz_id]
        ]

        # Step 5: Build NormContext and run input_builder
        satz_ctx = SatzContext(
            satz_id=satz_id,
            satz_text="Testsatz.",
            norm_typ_lvl_1="materiell-rechtlich",
            norm_typ_lvl_2="wenn-dann",
            atomare_tbm=[_make_atomares_tbm()],
            rechtsfolge=_make_rechtsfolge(),
            fundstellen=typed_fundstellen,
        )
        norm_ctx = _make_norm_context(saetze=[satz_ctx])
        build_result = build_satz_inputs(norm_ctx)

        assert len(build_result) == 1
        bw_input = build_result[0]
        assert len(bw_input.originaltexte) == len(originaltexte)

        # Verify fields survive the round-trip
        first_orig = originaltexte[0]
        first_ot = bw_input.originaltexte[0]
        assert first_ot.title == first_orig.title
        assert first_ot.text == first_orig.text
        assert first_ot.document_id == dokument_id
        assert first_ot.page_numbers == first_orig.page_numbers

    def test_grouping_by_satz_id_not_atomares_tbm_id(self, originaltexte: list[PageIndexSVMEntry]) -> None:
        """Prove that grouping by satz_id works but grouping by atomares_tbm_id would yield nothing."""
        satz_id = str(uuid4())

        inserts = map_fundstellen(
            originaltexte,
            chunk_to_dokument={},
            dms_to_dokument={entry.document_id: str(uuid4()) for entry in originaltexte},
            satz_id=satz_id,
            gesetz_id=str(uuid4()),
            norm_id=str(uuid4()),
        )

        stored = [{"id": ins["id"], **ins["payload"]} for ins in inserts]

        # Group by satz_id → works
        by_satz: dict[str, list[dict[str, Any]]] = {}
        for fs in stored:
            by_satz.setdefault(str(fs.get("satz_id", "")), []).append(fs)
        assert len(by_satz.get(satz_id, [])) == len(originaltexte)

        # Group by atomares_tbm_id → empty (field doesn't exist)
        by_tbm: dict[str, list[dict[str, Any]]] = {}
        for fs in stored:
            key = fs.get("atomares_tbm_id")
            if key:
                by_tbm.setdefault(str(key), []).append(fs)
        assert len(by_tbm) == 0, "No fundstelle should have atomares_tbm_id"


# =============================================================================
# Tests for the delete_stale_bewertungen_for_satz helper
# =============================================================================


class TestDeleteStaleBewertungenForSatz:
    @pytest.mark.asyncio
    async def test_deletes_outdated_bewertung_and_children(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Outdated bewertung + its markdown_text, kapitel, quelle are deleted."""
        satz_id = "target-satz"
        bewertung_id = "bew-outdated"
        markdown_id = "md-outdated"
        kapitel_id = "kap-outdated"
        quelle_id = "quelle-outdated"

        graph_nodes: list[dict[str, Any]] = [
            {"id": bewertung_id, "node_type": "bewertung", "is_outdated": True, "parents": []},
            {"id": "bew-fresh", "node_type": "bewertung", "is_outdated": False, "parents": []},
            {
                "id": kapitel_id,
                "node_type": "bewertung_kapitel",
                "is_outdated": False,
                "parents": [{"node_type": "bewertung", "id": bewertung_id}],
            },
            {
                "id": quelle_id,
                "node_type": "bewertung_quelle",
                "is_outdated": False,
                "parents": [{"node_type": "bewertung", "id": bewertung_id}],
            },
        ]

        batch_responses = {
            bewertung_id: {
                "id": bewertung_id,
                "node_type": "bewertung",
                "satz_id": satz_id,
                "markdown_text_id": markdown_id,
            },
        }

        async def mock_list_nodes(project_id: UUID) -> dict[str, list[dict[str, Any]]]:
            return {"nodes": graph_nodes}

        async def mock_batch_get_nodes(
            project_id: UUID, nodes: list[dict[str, Any]]
        ) -> dict[str, list[dict[str, Any]]]:
            results = [batch_responses[n["id"]] for n in nodes if n["id"] in batch_responses]
            return {"results": results}

        delete_calls: list[list[dict[str, Any]]] = []

        async def mock_update_nodes(
            project_id: UUID,
            inserts: list[dict[str, Any]],
            updates: list[dict[str, Any]] | None = None,
            deletes: list[dict[str, Any]] | None = None,
        ) -> dict[str, Any]:
            delete_calls.append(deletes or [])
            return {}

        monkeypatch.setattr(
            "src.workflows.result_insertion.ExaminationServiceClient.list_nodes",
            mock_list_nodes,
        )
        monkeypatch.setattr(
            "src.workflows.result_insertion.ExaminationServiceClient.batch_get_nodes",
            mock_batch_get_nodes,
        )
        monkeypatch.setattr(
            "src.workflows.result_insertion.ExaminationServiceClient.update_nodes",
            mock_update_nodes,
        )

        deleted = await delete_stale_bewertungen_for_satz(uuid4(), satz_id)

        assert deleted == EXPECTED_STALE_DELETE_COUNT
        assert len(delete_calls) == 1
        deleted_refs = {(d["node_type"], d["id"]) for d in delete_calls[0]}
        assert ("bewertung", bewertung_id) in deleted_refs
        assert ("markdown_text", markdown_id) in deleted_refs
        assert ("bewertung_kapitel", kapitel_id) in deleted_refs
        assert ("bewertung_quelle", quelle_id) in deleted_refs

    @pytest.mark.asyncio
    async def test_no_op_when_no_outdated_nodes(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Nothing is deleted if no bewertung is outdated."""

        async def mock_list_nodes(project_id: UUID) -> dict[str, list[dict[str, Any]]]:
            return {"nodes": [{"id": "bew-1", "node_type": "bewertung", "is_outdated": False, "parents": []}]}

        monkeypatch.setattr(
            "src.workflows.result_insertion.ExaminationServiceClient.list_nodes",
            mock_list_nodes,
        )

        deleted = await delete_stale_bewertungen_for_satz(uuid4(), "any-satz")
        assert deleted == 0

    @pytest.mark.asyncio
    async def test_only_deletes_matching_satz_id(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Only the bewertung belonging to the target satz_id is deleted."""
        target_satz = "satz-A"
        other_satz = "satz-B"
        bew_target = "bew-target"
        bew_other = "bew-other"

        graph_nodes: list[dict[str, Any]] = [
            {"id": bew_target, "node_type": "bewertung", "is_outdated": True, "parents": []},
            {"id": bew_other, "node_type": "bewertung", "is_outdated": True, "parents": []},
        ]

        async def mock_list_nodes(project_id: UUID) -> dict[str, list[dict[str, Any]]]:
            return {"nodes": graph_nodes}

        async def mock_batch_get_nodes(
            project_id: UUID, nodes: list[dict[str, Any]]
        ) -> dict[str, list[dict[str, Any]]]:
            results: list[dict[str, Any]] = [
                {"id": bew_target, "node_type": "bewertung", "satz_id": target_satz, "markdown_text_id": None},
                {"id": bew_other, "node_type": "bewertung", "satz_id": other_satz, "markdown_text_id": None},
            ]
            return {"results": results}

        delete_calls: list[list[dict[str, Any]]] = []

        async def mock_update_nodes(
            project_id: UUID,
            inserts: list[dict[str, Any]],
            updates: list[dict[str, Any]] | None = None,
            deletes: list[dict[str, Any]] | None = None,
        ) -> dict[str, Any]:
            delete_calls.append(deletes or [])
            return {}

        monkeypatch.setattr(
            "src.workflows.result_insertion.ExaminationServiceClient.list_nodes",
            mock_list_nodes,
        )
        monkeypatch.setattr(
            "src.workflows.result_insertion.ExaminationServiceClient.batch_get_nodes",
            mock_batch_get_nodes,
        )
        monkeypatch.setattr(
            "src.workflows.result_insertion.ExaminationServiceClient.update_nodes",
            mock_update_nodes,
        )

        deleted = await delete_stale_bewertungen_for_satz(uuid4(), target_satz)

        assert deleted == 1
        assert len(delete_calls) == 1
        deleted_refs = {(d["node_type"], d["id"]) for d in delete_calls[0]}
        assert ("bewertung", bew_target) in deleted_refs
        assert ("bewertung", bew_other) not in deleted_refs
