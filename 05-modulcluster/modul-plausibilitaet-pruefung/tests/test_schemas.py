"""Schema tests focused on custom behavior (aliases, defaults, roundtrips).

Plain Pydantic constraints (``Field(ge=, le=, min_length=)``) are not re-tested
here — they belong to Pydantic itself.
"""

from src.workflows.check_logic_wf.schemas.cluster_summarizer_schemas import (
    InconsistencySummary,
    NodeStance,
    SummarizerResponse,
)
from src.workflows.check_logic_wf.schemas.output_schemas import (
    Contradiction,
    ContradictionStatus,
    DocumentOutput,
    Occurrence,
)
from src.workflows.input_schemas import OrchestratorInputSchema


class TestOccurrenceSerialization:
    """``Occurrence`` exposes camelCase aliases for the frontend."""

    def test_alias_and_snake_case_dumps(self) -> None:
        occ = Occurrence(
            documentId="doc-1",
            documentName="Plan Doc",
            contentExcerpt="Excerpt",
            contradiction="Length differs",
            pageNumber=5,
        )
        aliased = occ.model_dump(by_alias=True)
        snake = occ.model_dump()

        assert aliased["documentId"] == "doc-1"
        assert aliased["pageNumber"] == 5
        assert {"document_id", "document_name", "content_excerpt", "page_number"} <= snake.keys()


class TestDocumentOutputRoundtrip:
    def test_roundtrip_preserves_enum_and_nested(self) -> None:
        contradiction = Contradiction(
            id="c-1",
            title="Widerspruch Leitungslänge",
            description="Dokument A sagt 50km, Dokument B sagt 30km.",
            rating=78,
            status=ContradictionStatus.OPEN,
            occurrences=[
                Occurrence(
                    documentId="doc-1", documentName="Plan",
                    contentExcerpt="50 km Leitung", contradiction="Angabe 50km",
                    pageNumber=3,
                ),
            ],
        )
        restored = DocumentOutput.model_validate(
            DocumentOutput(contradictions=[contradiction]).model_dump(mode="json")
        )
        assert restored.contradictions[0].status == ContradictionStatus.OPEN
        assert restored.contradictions[0].occurrences[0].page_number == 3


class TestSummarizerResponseRoundtrip:
    def test_with_nested_occurrences(self) -> None:
        summary = InconsistencySummary(
            cluster_title="Cluster Title",
            cluster_explanation="Detailed explanation of the cluster",
            rating=74,
            stances=[
                NodeStance(node_idx=0, stance_text="Position A"),
                NodeStance(node_idx=1, stance_text="Position B"),
            ],
            occurrences=[
                Occurrence(
                    documentId="doc-1", documentName="Doc",
                    contentExcerpt="Excerpt here", contradiction="Position A",
                ),
            ],
        )
        response = SummarizerResponse(inconsistencies=[summary])
        restored = SummarizerResponse.model_validate(response.model_dump(mode="json"))
        assert restored.inconsistencies[0].rating == 74
        assert len(restored.inconsistencies[0].occurrences) == 1


class TestOrchestratorInputSchema:
    def test_erlaeuterungsbericht_document_ids_are_preserved(self) -> None:
        inp = OrchestratorInputSchema(
            project_id="proj-1",
            document_ids=["doc-1", "doc-2"],
            erlaeuterungsbericht_document_ids=["doc-2"],
        )
        assert inp.erlaeuterungsbericht_document_ids == ["doc-2"]
