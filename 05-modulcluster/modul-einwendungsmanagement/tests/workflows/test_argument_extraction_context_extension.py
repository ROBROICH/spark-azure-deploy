import uuid

from temporal.contracts import ChunkArguments, ChunkEWMS, DocumentArguments, ExtractedArgument, Segment, TextSpan

from src.workflows.argument_extraction_batch_workflow import (
    ArgumentExtractionSingleBatchWorkflow,
    _extend_context_left,
    _extend_context_right,
)

CHUNK_TEXT = "AAAA first argument BBBB second argument CCCC"


def _span_of(text: str) -> TextSpan:
    start = CHUNK_TEXT.index(text)
    return TextSpan(start_idx=start, end_idx=start + len(text))


def _argument(argument_text: str, context_text: str | None = None) -> ExtractedArgument:
    argument_span = _span_of(argument_text)
    context_span = _span_of(context_text) if context_text else argument_span
    return ExtractedArgument(
        argument=Segment(text=argument_text, span=argument_span),
        description="desc",
        context=Segment(text=CHUNK_TEXT[context_span.start_idx : context_span.end_idx], span=context_span),
    )


def _assert_consistent(arg: ExtractedArgument) -> None:
    span = arg.context.span
    assert arg.context.text == CHUNK_TEXT[span.start_idx : span.end_idx]
    assert span.start_idx <= arg.argument.span.start_idx
    assert arg.argument.span.end_idx <= span.end_idx


def test_extend_context_left_and_right_reslices_chunk_text() -> None:
    arg = _argument("first argument")

    _extend_context_left(arg, CHUNK_TEXT, 0)
    assert arg.context.text == "AAAA first argument"
    _extend_context_right(arg, CHUNK_TEXT, arg.argument.span.end_idx + len(" BBBB"))
    assert arg.context.text == "AAAA first argument BBBB"
    _assert_consistent(arg)


def test_extend_context_never_shrinks_enclosing_context() -> None:
    arg = _argument("first argument", context_text="AAAA first argument BBBB")
    original_span = arg.context.span

    _extend_context_left(arg, CHUNK_TEXT, 2)
    _extend_context_right(arg, CHUNK_TEXT, arg.argument.span.end_idx + 1)

    assert arg.context.span == original_span
    _assert_consistent(arg)


def test_extending_one_side_keeps_the_other_context_bound() -> None:
    arg = _argument("second argument", context_text="BBBB second")

    _extend_context_left(arg, CHUNK_TEXT, 0)

    assert arg.context.span == TextSpan(start_idx=0, end_idx=_span_of("BBBB second").end_idx)
    assert arg.context.text == CHUNK_TEXT[: _span_of("BBBB second").end_idx]


def test_margins_and_residuals_keep_enclosing_context_consistent() -> None:
    workflow = ArgumentExtractionSingleBatchWorkflow()
    left = _argument("first argument", context_text="first argument BB")
    right = _argument("second argument", context_text="BB second argument")
    chunk_args = ChunkArguments(
        chunk=ChunkEWMS(chunk_id=uuid.uuid4(), page_content=CHUNK_TEXT, page_numbers=[1]),
        arguments=[left, right],
    )
    batches = [(chunk_args, [(0, 1, " BBBB ")])]

    prepared = workflow._prepare_sandwiches_and_margins(
        [DocumentArguments(document_id="doc", chunk_arguments=[chunk_args])]
    )
    assert prepared == batches
    assert left.context.text == "AAAA first argument BB"
    assert right.context.text == "BB second argument CCCC"

    workflow._apply_sandwich_decisions(batches, [[0]])
    assert left.context.text == "AAAA first argument BBBB "
    _assert_consistent(left)
    _assert_consistent(right)

    workflow._apply_sandwich_decisions(batches, [[1]])
    assert right.context.text == " BBBB second argument CCCC"
    _assert_consistent(right)
