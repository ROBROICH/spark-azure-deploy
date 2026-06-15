"""Orchestrator workflow for legal definition extraction across paragraphs."""

import re
from datetime import timedelta

from temporal.utils import sliding_window
from temporalio import workflow

from src.log.logger import Logger
from src.workflows.legal_definitionen.erkennung.lde import LegalDefinitionenExtrahiererAgent
from src.workflows.legal_definitionen.erkennung.lde_data_format import (
    LegalDefinitionenExtrahiererAgentInput,
)
from src.workflows.legal_definitionen.legal_definitionen_workflow_types import (
    LegalDefinitionEntry,
    LegalDefinitionenWorkflowInput,
    ParagraphInput,
)

MAX_CHUNK_SIZE = 10_000
DEFAULT_BATCH_SIZE = 5

logger = Logger("Legaldefinitionen DB")


@workflow.defn(name="LegalDefinitionenWorkflow")
class LegalDefinitionenWorkflow:
    """Extracts legal definitions from a list of paragraphs via child workflows."""

    @workflow.run
    async def run(self, input: LegalDefinitionenWorkflowInput) -> list[LegalDefinitionEntry]:
        """Execute legal definition extraction across all paragraphs of a law."""
        logger.info(f"Total paragraphs to process: {len(input.paragraphs)}")

        all_entries = await self._process_all_paragraphs(input.paragraphs)
        logger.info(f"Total extracted legal definitions: {len(all_entries)}")

        return all_entries

    @classmethod
    async def _process_all_paragraphs(
        cls,
        paragraphs: list[ParagraphInput],
    ) -> list[LegalDefinitionEntry]:
        """Process all paragraphs in parallel with sliding window."""
        results_nested = await sliding_window(paragraphs, cls._process_paragraph, concurrency=DEFAULT_BATCH_SIZE)
        return [entry for entries in results_nested for entry in entries]

    @classmethod
    async def _process_paragraph(cls, paragraph: ParagraphInput) -> list[LegalDefinitionEntry]:
        """Extract definitions from a single paragraph's text chunks."""
        chunks = cls._split_text(paragraph.paragraph_text)

        async def _process_chunk(chunk: str) -> list[LegalDefinitionEntry]:
            """Process a single chunk and collect its definitions."""
            return await cls._extract_definitions(paragraph, chunk)

        results = await sliding_window(chunks, _process_chunk, concurrency=10)
        return [entry for entries in results for entry in entries]

    @staticmethod
    async def _extract_definitions(
        paragraph: ParagraphInput,
        text_chunk: str,
    ) -> list[LegalDefinitionEntry]:
        """Run the LDE agent on a single text chunk."""
        output = await workflow.execute_child_workflow(
            LegalDefinitionenExtrahiererAgent.run,
            LegalDefinitionenExtrahiererAgentInput(
                paragraph_text=text_chunk,
                ist_begriffsbestimmungen=paragraph.ist_begriffsbestimmungen,
            ),
            task_timeout=timedelta(seconds=60),
        )

        return [
            LegalDefinitionEntry(
                jurabk=paragraph.jurabk,
                paragraph_nr=paragraph.paragraph_nr,
                titel=paragraph.titel,
                begriff=entry.begriff,
                definition=entry.definition,
            )
            for entry in output
        ]

    @staticmethod
    def _split_text(text: str) -> list[str]:
        """Split text into chunks of at most MAX_CHUNK_SIZE characters.

        Strategy:
        1. If text <= MAX_CHUNK_SIZE: return as-is (no splitting needed).
        2. If text > MAX_CHUNK_SIZE: split into sentences and greedily
           accumulate into chunks that stay within the limit.
        3. If a single sentence > MAX_CHUNK_SIZE: fall back to character
           splitting for that sentence.
        """
        if len(text) <= MAX_CHUNK_SIZE:
            return [text]

        sentences = _smart_split_sentences(text)
        chunks: list[str] = []
        current_chunk = ""

        for sentence in sentences:
            # Sentence itself exceeds limit — character-split it
            if len(sentence) > MAX_CHUNK_SIZE:
                # Flush current chunk first
                if current_chunk:
                    chunks.append(current_chunk)
                    current_chunk = ""
                # Split the oversized sentence into character blocks
                for i in range(0, len(sentence), MAX_CHUNK_SIZE):
                    chunks.append(sentence[i : i + MAX_CHUNK_SIZE])
                continue

            # Adding this sentence would exceed the limit — start a new chunk
            candidate = f"{current_chunk}. {sentence}" if current_chunk else sentence
            if len(candidate) > MAX_CHUNK_SIZE:
                chunks.append(current_chunk)
                current_chunk = sentence
            else:
                current_chunk = candidate

        if current_chunk:
            chunks.append(current_chunk)

        return chunks


def _smart_split_sentences(text: str) -> list[str]:
    """Split German legal text into sentences, avoiding false splits on abbreviations.

    Handles: month names, uppercase abbreviations (ABl., BGBl.), legal references
    (Art. 22), and roman numerals.
    """
    months = [
        "Januar",
        "Februar",
        "März",
        "April",
        "Mai",
        "Juni",
        "Juli",
        "August",
        "September",
        "Oktober",
        "November",
        "Dezember",
    ]

    pattern = (
        r"\.\s+"
        r"(?!\w+\.)"
        r"(?![IVXLCDM]+\b)"
        r"(?!\d+[a-z]?\b)"
        r"(?![A-Z]\w+[VG])"
        r"(?![A-ZÄÖÜ]+\b)"
        r"(?!(?:" + "|".join(months) + r")\b)"
        r"(?=[A-ZÄÖÜ§])"
    )

    parts = re.split(pattern, text)
    return [p.strip() for p in parts if p.strip()]
