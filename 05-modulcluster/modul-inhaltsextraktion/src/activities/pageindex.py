# src/activities/pageindex.py
"""
Temporal activities for PageIndex summary generation.

"""

import asyncio
import logging

import tiktoken
from prompt_injection.prompt_defense import render_prompt_format, wrap_system_prompt
from pydantic import BaseModel
from temporal.activities.llm import llm_invoke_structured
from temporal.utils import sliding_window
from temporalio import workflow

from src.config import get_config
from src.env import ENV
from src.processors.text_splitters import RecursiveCharacterTextSplitter
from src.schemas import Chunk, PageIndexNode
from src.workflows.pageindex_structure.prompt import (
    GENERATE_NODE_SUMMARY_SYSTEM_PROMPT,
    GENERATE_NODE_SUMMARY_USER_TEMPLATE,
    JOIN_SUMMARIES_SYSTEM_PROMPT,
    JOIN_SUMMARIES_USER_TEMPLATE,
)
from src.workflows.pageindex_structure.types import (
    NodeSummaryResponse,
    RecursiveSummaryResponse,
)

logger = logging.getLogger("uvicorn")

# Use cl100k_base directly — it's a reasonable approximation for any model
# and avoids coupling to a specific OpenAI model name.
_ENCODING = tiktoken.get_encoding("cl100k_base")

MAX_TOKENS_PER_CHUNK = ENV.STRUCTURE_NODE_MAX_NODE_CHARS // 4


class PageNode(BaseModel):
    """
    A PageNode represents the text to be summarized for each node.
    """

    node_id: str
    text: str
    node_chunk: Chunk
    summary: str | None = None


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------


def count_tokens(text: str) -> int:
    """Return the number of cl100k_base tokens in the given text."""
    if not text:
        return 0
    return len(_ENCODING.encode(text))


# ---------------------------------------------------------------------------
# LLM summary helpers
# ---------------------------------------------------------------------------


_MAX_RECURSIVE_SUMMARY_DEPTH = 5


async def recursive_summary(
    text: str, *, _depth: int = 0
) -> str:
    """Recursively split and summarize text until it fits the character limit."""
    if _depth >= _MAX_RECURSIVE_SUMMARY_DEPTH:
        logger.warning(
            "recursive_summary: max recursion depth (%d) reached, truncating.",
            _MAX_RECURSIVE_SUMMARY_DEPTH,
        )
        return text[:ENV.STRUCTURE_NODE_MAX_NODE_CHARS]

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=ENV.STRUCTURE_NODE_MAX_NODE_CHARS // 4,
        chunk_overlap=min(200, ENV.STRUCTURE_NODE_MAX_NODE_CHARS // 8),
        keep_separator=True,
        is_separator_regex=False,
    )
    lst_summaries: list[str] = []
    for chunk_text in text_splitter.split_text(text):
        llm_result = await llm_invoke_structured(
            render_prompt_format(GENERATE_NODE_SUMMARY_USER_TEMPLATE, node_text=chunk_text + " (...)"),
            wrap_system_prompt(GENERATE_NODE_SUMMARY_SYSTEM_PROMPT),
            NodeSummaryResponse,
            model=ENV.STRUCTURE_MODEL_NAME,
            temperature=0.1,
        )
        lst_summaries.append(llm_result.summary)
    joint_summaries = "\n\n".join(lst_summaries)
    if len(joint_summaries) > ENV.STRUCTURE_NODE_MAX_NODE_CHARS:
        # Circuit Breaker: explicitly catch LLM hallucination/expansion.
        if len(joint_summaries) >= len(text):
            logger.warning(
                "recursive_summary: LLM expanded text instead of summarizing it. Attempting truncation bailout.")
            return joint_summaries[:ENV.STRUCTURE_NODE_MAX_NODE_CHARS]
        joint_summaries = await recursive_summary(joint_summaries, _depth=_depth + 1)

    return joint_summaries


async def generate_long_summary(text: str) -> str:
    """Create long summaries by summarizing parts and then joining them through another LLM call."""
    joint_summaries = await recursive_summary(text)

    llm_result = await llm_invoke_structured(
        render_prompt_format(JOIN_SUMMARIES_USER_TEMPLATE, joint_summary=joint_summaries),
        wrap_system_prompt(JOIN_SUMMARIES_SYSTEM_PROMPT),
        RecursiveSummaryResponse,
        model=ENV.STRUCTURE_MODEL_NAME,
        temperature=0.1,
    )
    return llm_result.summary


async def generate_node_summary(node: PageNode) -> str:
    """Generate an LLM summary for a single page node, splitting long text if needed."""
    node_txt: str = node.text
    if len(node_txt) > ENV.STRUCTURE_NODE_MAX_NODE_CHARS:
        node_summary = await generate_long_summary(node_txt)
    else:
        llm_result = await llm_invoke_structured(
            render_prompt_format(GENERATE_NODE_SUMMARY_USER_TEMPLATE, node_text=node_txt),
            wrap_system_prompt(GENERATE_NODE_SUMMARY_SYSTEM_PROMPT),
            NodeSummaryResponse,
            model=ENV.STRUCTURE_MODEL_NAME,
            temperature=0.1,
        )
        node_summary = llm_result.summary
    return node_summary


# ---------------------------------------------------------------------------
# Markdown → tree building
# ---------------------------------------------------------------------------


async def get_node_summary(node: PageNode) -> str:
    """Return a summary for a node, using the LLM only if the text exceeds the token threshold."""
    node_text: str = node.text
    num_tokens = count_tokens(node_text)
    if num_tokens < ENV.PAGE_INDEX_MIN_TOKEN_THRESHOLD:
        node_summary = node_text
    else:
        node_summary = await generate_node_summary(node)
    return node_summary


async def _summarize_node(node: PageNode) -> PageNode:
    """Summarize one node in place and return it."""
    node.summary = await get_node_summary(node)
    return node


async def generate_summaries_for_structure(
    nodes: list[PageNode],
) -> list[PageNode]:
    """Generate summaries for all nodes with a bounded concurrency window.

    Every node above the token threshold schedules its own LLM activity. Doing
    that for all nodes at once puts their payloads into a single workflow task,
    whose size can exceed the server's gRPC message limit on documents with many
    chapters. The shared sliding window keeps the in-flight count bounded and
    yields every TEMPORAL_FLUSH_INTERVAL scheduled tasks, so the commands per
    workflow task stay bounded regardless of the configured concurrency.

    A failing node propagates, as before: pageindex feeds retrieval, so a partial
    structure must not pass silently.
    """
    if workflow.patched("pageindex-summary-window"):
        await sliding_window(nodes, _summarize_node, get_config().PAGE_INDEX_SUMMARY_CONCURRENCY)
    else:
        # Unmarked histories scheduled every summary in the same workflow task.
        tasks_results = []
        async with asyncio.TaskGroup() as tg:
            for node in nodes:
                tasks_results.append(tg.create_task(get_node_summary(node)))
        summaries = [t.result() for t in tasks_results]
        for node, summary in zip(nodes, summaries, strict=True):
            node.summary = summary
    return nodes


# ---------------------------------------------------------------------------
# Activity definitions
# ---------------------------------------------------------------------------


def gather_structure(chunks: list[Chunk]) -> list[PageNode]:
    """Group consecutive chunks by header into PageNode instances for summarization."""
    current_header = None
    current_text = ""
    node_id = 0
    lst_nodes = []
    node_chunk = None
    for chk in chunks:
        if node_chunk is None:
            current_header = chk.header
            node_chunk = chk
        elif chk.header != current_header:
            # Add previous information.
            lst_nodes.append(PageNode(node_id=str(node_id), text=current_text, node_chunk=node_chunk))
            # Move on.
            current_text = ""
            current_header = chk.header
            node_chunk = chk
            node_id += 1
        # All sub-chunks
        for sub_chk in chk.sub_chunks:
            current_text += sub_chk.page_content
    # Add last node if the context was not unloaded.
    if current_text != "":
        lst_nodes.append(PageNode(node_id=str(node_id), text=current_text, node_chunk=node_chunk))
    return lst_nodes


class MyPageIndexTaskInput(BaseModel):
    """Input for the pageindex summarization activity."""

    chunks: list[Chunk]


class MyPageIndexTaskOutput(BaseModel):
    """Output of the pageindex summarization activity."""

    chunks: list[Chunk]


async def pageindex_task(chunks: list[Chunk]) -> MyPageIndexTaskOutput:
    """Workflow wrapper: execute the pageindex summarization."""
    return await _pageindex_task(MyPageIndexTaskInput(chunks=chunks))


async def _pageindex_task(input: MyPageIndexTaskInput) -> MyPageIndexTaskOutput:
    """Populates the pageindex structure in place summarizing sections."""

    # Get text for nodes.
    nodes = gather_structure(input.chunks)

    # Fill in the summaries.
    nodes_with_summaries = await generate_summaries_for_structure(
        nodes=nodes,
    )

    # Fill in the chunks.
    for nd in nodes_with_summaries:
        marked_chunk = nd.node_chunk
        assert nd.summary is not None
        marked_chunk.page_index_node = PageIndexNode(node_id=nd.node_id, summary=nd.summary)

    chunks = input.chunks
    filled_chunks = MyPageIndexTaskOutput(chunks=chunks)

    return filled_chunks
