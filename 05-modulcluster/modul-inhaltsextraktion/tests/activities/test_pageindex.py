"""Tests for pageindex activity functions and structure generation."""
from unittest.mock import AsyncMock, patch

import pytest

from src.activities.pageindex import (
    MyPageIndexTaskInput,
    PageNode,
    _pageindex_task,
    gather_structure,
    generate_node_summary,
    generate_summaries_for_structure,
    get_node_summary,
    recursive_summary,
)
from src.env import ENV
from src.schemas import Chunk, SubChunk

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_chunk():
    """Create a Chunk fixture with one sub-chunk and a header."""
    sub_chunk = SubChunk(page_content="sub text")
    return Chunk(page_content="chunk text", sub_chunks=[sub_chunk], header="Header 1")


@pytest.fixture
def long_text_chunk():
    """Create a long text string that triggers multiple splits."""
    return "x " * 10000  # long enough to trigger multiple splits


# ---------------------------------------------------------------------------
# get_node_summary
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_node_summary_below_threshold(mock_chunk):
    """Test that short text is returned directly without LLM call."""
    node = PageNode(node_id="1", text="short text", node_chunk=mock_chunk)

    result = await get_node_summary(node)

    assert result == "short text"


@pytest.mark.asyncio
async def test_get_node_summary_above_threshold_calls_llm(mock_chunk):
    """Test that text above token threshold triggers LLM summarization."""
    node = PageNode(node_id="1", text="long text", node_chunk=mock_chunk)

    with (
        patch("src.activities.pageindex.count_tokens", return_value=1000),
        patch("src.activities.pageindex.generate_node_summary", new=AsyncMock(return_value="summary")),
    ):
        with patch.object(ENV, "PAGE_INDEX_MIN_TOKEN_THRESHOLD", 10):
            result = await get_node_summary(node)

    assert result == "summary"


# ---------------------------------------------------------------------------
# generate_node_summary
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_node_summary_short_text_calls_llm(mock_chunk):
    """Test that short text within char limit calls LLM directly."""
    node = PageNode(node_id="1", text="short", node_chunk=mock_chunk)

    mock_response = AsyncMock()
    mock_response.summary = "node summary"

    with (
        patch("src.activities.pageindex.llm_invoke_structured", return_value=mock_response),
        patch.object(ENV, "STRUCTURE_NODE_MAX_NODE_CHARS", 1000),
    ):
        summary = await generate_node_summary(node)

    assert summary == "node summary"


@pytest.mark.asyncio
async def test_generate_node_summary_long_text_calls_recursive(mock_chunk):
    """Test that text exceeding char limit triggers recursive summarization."""
    node = PageNode(node_id="1", text="x" * 5000, node_chunk=mock_chunk)

    with (
        patch("src.activities.pageindex.generate_long_summary", new=AsyncMock(return_value="long summary")),
        patch.object(ENV, "STRUCTURE_NODE_MAX_NODE_CHARS", 100),
    ):
        summary = await generate_node_summary(node)

    assert summary == "long summary"


# ---------------------------------------------------------------------------
# generate_summaries_for_structure
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_summaries_for_structure(mock_chunk):
    """Test that summaries are generated for all nodes in the structure."""
    nodes = [
        PageNode(node_id="0", text="a", node_chunk=mock_chunk),
        PageNode(node_id="1", text="b", node_chunk=mock_chunk),
    ]

    async def fake_summary(node):
        """Return a fake summary based on node_id."""
        return f"summary-{node.node_id}"

    with patch(
        "src.activities.pageindex.get_node_summary",
        side_effect=fake_summary,
    ):
        result = await generate_summaries_for_structure(
            nodes,
        )

    assert result[0].summary == "summary-0"
    assert result[1].summary == "summary-1"


# ---------------------------------------------------------------------------
# recursive_summary
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_recursive_summary_multiple_chunks():
    """Test that recursive_summary handles text requiring multiple chunks."""
    text = "chunk1" * 500 + "chunk2" * 500 + "chunk3" * 500

    mock_node_response = AsyncMock()
    mock_node_response.summary = "summary"

    with (
        patch("src.activities.pageindex.llm_invoke_structured", return_value=mock_node_response),
        patch.object(ENV, "STRUCTURE_NODE_MAX_NODE_CHARS", 500),
    ):
        summary = await recursive_summary(text)

    assert len(summary) < 500


@pytest.mark.asyncio
async def test_recursive_summary_triggers_recursion_safely(mock_chunk):
    """Test that recursive summarization terminates safely when first call is long."""
    node = PageNode(node_id="0", text="x " * 500, node_chunk=mock_chunk)

    # Define async side_effect function
    call_count = 0

    async def fake_llm_invoke(*args, **kwargs):
        """Simulate LLM responses with decreasing summary lengths."""
        nonlocal call_count
        call_count += 1
        if call_count == 1:

            class Resp:
                """Fake long LLM response triggering recursion."""

                summary = "s" * 350  # first call long summary → triggers recursion

            return Resp()
        elif call_count == 2:

            class Resp:
                """Fake short LLM response ending recursion."""

                summary = "s"  # second call ends recursion

            return Resp()
        elif call_count == 3:
            class Resp:
                """Fake LLM response for third call."""

                summary = "e"
            return Resp()
        else:
            class Resp:
                """Fake LLM response for subsequent calls."""

                summary = "t"
            return Resp()
    with (
        patch("src.activities.pageindex.llm_invoke_structured", side_effect=fake_llm_invoke),
        patch.object(ENV, "STRUCTURE_NODE_MAX_NODE_CHARS", 400)
    ):
        result = await generate_node_summary(node)

    assert "t" in result
    assert  "e" not in result
    assert len(result) == 1


# ---------------------------------------------------------------------------
#  gather_structure.
# ---------------------------------------------------------------------------


def test_gather_structure_no_subchunks():
    """Test that gather_structure handles chunks with no sub-chunks."""
    chunk = Chunk(page_content="main text", sub_chunks=[], header="Header A")
    nodes = gather_structure([chunk])
    assert len(nodes) == 0 or nodes[0].text == ""  # since no sub_chunks


def test_gather_structure_consecutive_same_header():
    """Test that consecutive chunks with the same header are merged."""
    sub1 = SubChunk(page_content="text1")
    sub2 = SubChunk(page_content="text2")
    chunk1 = Chunk(sub_chunks=[sub1], header="H", page_content="A")
    chunk2 = Chunk(sub_chunks=[sub2], header="H", page_content="B")
    nodes = gather_structure([chunk1, chunk2])
    assert len(nodes) == 1
    assert "text1" in nodes[0].text
    assert "text2" in nodes[0].text


# ---------------------------------------------------------------------------
#  test the task itself.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pageindex_task_assigns_page_index_node(mock_chunk):
    """Test that _pageindex_task assigns page_index_node to chunks."""
    input_model = MyPageIndexTaskInput(chunks=[mock_chunk])

    async def fake_generate(nodes):
        """Assign fake summaries to all nodes."""
        for i, node in enumerate(nodes):
            node.summary = f"summary-{i}"
        return nodes

    with patch("src.activities.pageindex.generate_summaries_for_structure", side_effect=fake_generate):
        output = await _pageindex_task(input_model)

    # The original chunk should now have page_index_node assigned
    assert output.chunks[0].page_index_node is not None
    assert output.chunks[0].page_index_node.summary == "summary-0"


@pytest.mark.asyncio
async def test__pageindex_task_assigns_page_index_node(mock_chunk):
    """Test that _pageindex_task correctly sets summary on page_index_node."""
    input_model = MyPageIndexTaskInput(chunks=[mock_chunk])

    async def fake_generate(nodes):
        """Assign fake summaries to all nodes."""
        for i, node in enumerate(nodes):
            node.summary = f"summary-{i}"
        return nodes

    with patch("src.activities.pageindex.generate_summaries_for_structure", side_effect=fake_generate):
        output = await _pageindex_task(input_model)

    # This ensures the assert nd.summary is not None is covered
    assert output.chunks[0].page_index_node is not None
    assert output.chunks[0].page_index_node.summary == "summary-0"
