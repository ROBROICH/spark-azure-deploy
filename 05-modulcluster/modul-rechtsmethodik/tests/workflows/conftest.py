"""Shared fixtures for all workflow tests."""

import pytest
from temporal.contracts import (
    Auslegungsvorschlag,
    UnbestimmterRechtsbegriff,
)

from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_types import (
    DrucksachenChunk,
    UnbestimmterRechtsbegriffWithContext,
    UTChunk,
    UTCitation,
)


@pytest.fixture
def satz_text() -> str:
    return "Wer eine Anlage ohne Genehmigung betreibt, wird mit Freiheitsstrafe bestraft."


@pytest.fixture
def rechtsfolge_text() -> str:
    return "Die Behörde kann die Genehmigung erteilen."


@pytest.fixture
def atomare_tbms() -> list[str]:
    return [
        "Der Antragsteller hat einen Antrag gestellt.",
        "Die gesetzlichen Voraussetzungen sind erfüllt.",
    ]


@pytest.fixture
def u_begriff() -> UnbestimmterRechtsbegriff:
    return UnbestimmterRechtsbegriff(
        begriff="öffentliches Interesse",
        auslegungsvorschläge=[
            Auslegungsvorschlag(auslegung_methode="wortlaut", auslegungsvorschlag="Interesse der Allgemeinheit"),
            Auslegungsvorschlag(auslegung_methode="systematik", auslegungsvorschlag="Übergeordnetes Gemeinwohl"),
            Auslegungsvorschlag(auslegung_methode="historie", auslegungsvorschlag="Historisch gewachsener Begriff"),
            Auslegungsvorschlag(auslegung_methode="telos", auslegungsvorschlag="Zweck des Allgemeinwohls"),
        ],
    )


@pytest.fixture
def ut_chunk() -> UTChunk:
    return UTChunk(
        section_title="Leitsatz",
        section_number="1",
        section_text="Das öffentliche Interesse erfordert ...",
        chunk_index=0,
        start_char=0,
        end_char=100,
        section_length=100,
        is_complete_section=True,
        id=42,
        doc_id="bverwg-2023-001",
        gericht="BVerwG",
        datum="2023-01-15",
        aktenzeichen="7 C 1/22",
        dokumenttyp="Urteil",
        normen=[{"name": "BNatSchG", "paragraph": "44"}],
        similarity=0.85,
        zitierte_urteile=[UTCitation(aktenzeichen="7 C 5/20", randnummer="12")],
    )


@pytest.fixture
def drucksachen_chunk() -> DrucksachenChunk:
    return DrucksachenChunk(
        dokumentnummer="BT-Drs 19/1234",
        datum="2019-03-01",
        seite="42",
        text="Der Begriff des öffentlichen Interesses ...",
        zitierte_entscheidungen=[],
    )


@pytest.fixture
def u_begriff_with_context(
    u_begriff: UnbestimmterRechtsbegriff,
    ut_chunk: UTChunk,
    drucksachen_chunk: DrucksachenChunk,
) -> UnbestimmterRechtsbegriffWithContext:
    return UnbestimmterRechtsbegriffWithContext(
        begriff=u_begriff.begriff,
        auslegungsvorschläge=u_begriff.auslegungsvorschläge,
        u_context=[ut_chunk],
        d_context=[drucksachen_chunk],
    )


@pytest.fixture
def rechtsfolge_gebot() -> str:
    return "Die Behörde muss die Genehmigung erteilen."
