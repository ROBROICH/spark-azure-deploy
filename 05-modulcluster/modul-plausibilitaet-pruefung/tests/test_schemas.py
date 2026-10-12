"""Schema tests focused on custom behavior (aliases, defaults, roundtrips).

Plain Pydantic constraints (``Field(ge=, le=, min_length=)``) are not re-tested
here — they belong to Pydantic itself.
"""

import pytest
from pydantic import ValidationError
from temporal.contracts import (
    PlausibilityCheckResult,
    PlausibilityContradiction,
    PlausibilityContradictionOccurrence,
    PlausibilityOrchestratorInput,
    PlausibilityStatus,
)

from src.workflows.check_logic_wf.schemas.note_schemas import RubricResponse, rubric_response_for


class TestOccurrenceSerialization:
    """Generated Plausibility occurrences expose the backend's camelCase wire contract."""

    def test_alias_and_snake_case_dumps(self) -> None:
        occ = PlausibilityContradictionOccurrence(
            document_id="doc-1",
            document_name="Plan Doc",
            content_excerpt="Excerpt",
            contradiction="Length differs",
            page_number=5,
        )
        aliased = occ.model_dump(by_alias=True)
        snake = occ.model_dump()

        assert aliased["documentId"] == "doc-1"
        assert aliased["pageNumber"] == 5  # noqa: PLR2004
        assert {"document_id", "document_name", "content_excerpt", "page_number"} <= snake.keys()


class TestDocumentOutputRoundtrip:
    def test_roundtrip_preserves_enum_and_nested(self) -> None:
        contradiction = PlausibilityContradiction(
            id="c-1",
            title="Widerspruch Leitungslänge",
            description="Dokument A sagt 50km, Dokument B sagt 30km.",
            rating=78,
            status=PlausibilityStatus.OPEN,
            occurrences=[
                PlausibilityContradictionOccurrence(
                    document_id="doc-1",
                    document_name="Plan",
                    content_excerpt="50 km Leitung",
                    contradiction="Angabe 50km",
                    page_number=3,
                ),
            ],
        )
        restored = PlausibilityCheckResult.model_validate(
            PlausibilityCheckResult(contradictions=[contradiction]).model_dump(mode="json")
        )
        assert restored.contradictions[0].status == PlausibilityStatus.OPEN
        assert restored.contradictions[0].occurrences[0].page_number == 3  # noqa: PLR2004


class TestOrchestratorInputSchema:
    def test_erlaeuterungsbericht_document_ids_are_preserved(self) -> None:
        inp = PlausibilityOrchestratorInput(  # pyrefly: ignore[missing-argument]
            project_id="proj-1",
            document_ids=["doc-1", "doc-2"],
            erlaeuterungsbericht_document_ids=["doc-2"],
        )
        assert inp.erlaeuterungsbericht_document_ids == ["doc-2"]


class TestRubricResponseSchema:
    def test_exact_count_is_enforced_in_schema_and_validation(self) -> None:
        klasse = rubric_response_for(2)
        stellen_schema = klasse.model_json_schema()["properties"]["stellen"]
        assert (stellen_schema["minItems"], stellen_schema["maxItems"]) == (2, 2)
        assert issubclass(klasse, RubricResponse)
        assert rubric_response_for(2) is klasse  # cached per count
        stelle = {"rolle": "sachaussage", "gegenstand": "", "merkmal": "", "wert": "", "bezugsrahmen": ""}
        basis = {"gleicher_gegenstand": "ja", "unvereinbar": "ja", "begruendung": ""}
        assert len(klasse.model_validate({"stellen": [stelle, stelle], **basis}).stellen) == 2  # noqa: PLR2004
        with pytest.raises(ValidationError):
            klasse.model_validate({"stellen": [stelle, stelle, stelle], **basis})
