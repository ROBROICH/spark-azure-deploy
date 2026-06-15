from src.activities.argument_extraction_activities import span_positions
from src.schemas.argument_extraction_schemas import SpanPositionRequest, SpanPositionsActivityParams


def test_span_positions_grounds_exact_snippets() -> None:
    result = span_positions(
        SpanPositionsActivityParams(
            items=[
                SpanPositionRequest(
                    span_text="second sentence",
                    full_text="first sentence. second sentence.",
                ),
                SpanPositionRequest(
                    span_text="first sentence",
                    full_text="first sentence. second sentence.",
                ),
            ],
            threshold=0.7,
        )
    )

    assert len(result) == 2
    assert result[0].start_idx == 16
    assert result[0].end_idx == 31
    assert result[1].start_idx == 0
    assert result[1].end_idx == 14


def test_span_positions_returns_fuzzy_match_above_threshold() -> None:
    result = span_positions(
        SpanPositionsActivityParams(
            items=[
                SpanPositionRequest(
                    span_text="second sentense",
                    full_text="first sentence. second sentence.",
                ),
            ],
            threshold=0.7,
        )
    )

    assert len(result) == 1
    assert result[0].start_idx == 16
    assert result[0].end_idx == 31


def test_span_positions_returns_negative_span_when_snippet_cannot_be_grounded() -> None:
    result = span_positions(
        SpanPositionsActivityParams(
            items=[
                SpanPositionRequest(
                    span_text="missing text",
                    full_text="available text only",
                ),
            ],
            threshold=0.95,
        )
    )

    assert len(result) == 1
    assert result[0].start_idx == -1
    assert result[0].end_idx == -1
