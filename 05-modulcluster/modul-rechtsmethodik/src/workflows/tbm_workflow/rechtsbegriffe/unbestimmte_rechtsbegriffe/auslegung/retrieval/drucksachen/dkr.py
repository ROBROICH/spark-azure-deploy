"""Agent for retrieving and filtering relevant Drucksachen context."""

from datetime import datetime
from typing import Any

from temporalio import workflow

from src.activities.law_api_calls import QueryChunksUTInput, QueryTopKDRInput, query_chunks_ut, query_top_k_dr
from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_types import (
    DrucksachenChunk,
    UTCitation,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.bverwg_citations import (
    BVERWG_AZ_RN_ANCHORED,
    citations_from_matches,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.drucksachen.dkr_data_format import (
    DrucksachenKontextAnalysisOutput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.drucksachen.dkr_prompt import (
    dkr_agent_prompt,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.retrieval_types import (
    DrucksachenKontextRetrievalAgentInput,
    FormattedDrucksachenChunk,
)


@workflow.defn(name="DrucksachenKontextRetrievalAgentWorkflow")
class DrucksachenKontextRetrievalAgentWorkflow:
    """Agent for retrieving relevant chunks from the Drucksachen."""

    @workflow.run
    async def run(
        self,
        input: DrucksachenKontextRetrievalAgentInput,
    ) -> list[DrucksachenChunk]:
        """Retrieve and filter relevant Drucksachen for a Rechtsbegriff."""
        raw_chunks = await query_top_k_dr(
            QueryTopKDRInput(
                jurabk=input.jurabk,
                query_text=f"Auslegung und Interpretation des unbestimmten Rechtsbegriffes '{input.begriff}'",
                section_substrings=input.section_substrings,
                k=10,
            )
        )

        if not raw_chunks:
            return []

        formatted_chunks = self._format_raw_chunks(raw_chunks)
        formatted_chunks_w_citations = await self._enrich_chunks_with_citations(formatted_chunks)
        filter_output = await self._invoke_llm_filter(input, formatted_chunks_w_citations)
        return self._build_result(formatted_chunks_w_citations, filter_output)

    @staticmethod
    def _format_raw_chunks(chunks: list[dict[str, Any]]) -> list[FormattedDrucksachenChunk]:
        """Convert raw DB results to structured DrucksachenChunks."""
        return [
            FormattedDrucksachenChunk(
                id=str(index),
                dokumentnummer="BT-Drs. " + chunk["dokumentnummer"],
                datum=chunk["datum"],
                chunk_titel=chunk["section_title"],
                chunk_text=chunk["section_text"],
                seite=str(chunk["start_page"]),
            )
            for index, chunk in enumerate(chunks)
        ]

    @staticmethod
    async def _fetch_citation(citation: UTCitation) -> list[UTCitation] | None:
        """Fetch citation details for a Drucksache chunk."""
        ut_chunks = await query_chunks_ut(
            QueryChunksUTInput(
                aktenzeichen=citation.aktenzeichen,
                section_number=int(citation.randnummer),
            )
        )
        if ut_chunks:
            return [citation.model_copy(update={"text": ut_chunk["text"]}) for ut_chunk in ut_chunks]
        return None

    @classmethod
    async def _enrich_single_chunk(cls, chunk: FormattedDrucksachenChunk) -> FormattedDrucksachenChunk:
        """Add citation metadata to a single chunk."""
        citations = cls._extract_citations_with_rn(chunk.chunk_text)
        results = await workflow.asyncio.gather(*[cls._fetch_citation(c) for c in citations])
        zitierte_urteile = [citation for result in results if result is not None for citation in result]
        return chunk.model_copy(update={"zitierte_urteile": zitierte_urteile})

    @classmethod
    async def _enrich_chunks_with_citations(
        cls,
        chunks: list[FormattedDrucksachenChunk],
    ) -> list[FormattedDrucksachenChunk]:
        """Enrich all chunks with citation metadata in parallel."""
        return await workflow.asyncio.gather(*[cls._enrich_single_chunk(chunk) for chunk in chunks])

    @staticmethod
    async def _invoke_llm_filter(
        input: DrucksachenKontextRetrievalAgentInput,
        chunks: list[FormattedDrucksachenChunk],
    ) -> DrucksachenKontextAnalysisOutput:
        """Use LLM to filter chunks by relevance to the Rechtsbegriff."""
        chunks_for_llm = [
            {
                "id": chunk.id,
                "titel": chunk.chunk_titel,
                "text": chunk.chunk_text,
                "zitierte_entscheidungen": [u.model_dump() for u in chunk.zitierte_urteile],
            }
            for chunk in chunks
        ]
        return await llm_invoke(
            activity_input={
                "model_name": ENV.MODELS.LARGE_LLM,
                "temperature": 0,
                "thinking": False,
                "prompt_template": dkr_agent_prompt,
                "input_dict": {
                    "normstelle": input.normstelle,
                    "satz_text": input.satz_text,
                    "unbestimmter_rechtsbegriff": input.begriff,
                    "chunks": chunks_for_llm,
                },
            },
            output_class=DrucksachenKontextAnalysisOutput,
        )

    @staticmethod
    def _build_result(
        chunks: list[FormattedDrucksachenChunk],
        filter_output: DrucksachenKontextAnalysisOutput,
    ) -> list[DrucksachenChunk]:
        """Assemble final DrucksachenChunk list from filtered output."""
        return [
            DrucksachenChunk(
                dokumentnummer=chunk.dokumentnummer,
                datum=datetime.strptime(chunk.datum, "%Y-%m-%d").strftime("%d.%m.%Y"),
                seite=chunk.seite,
                text=chunk.chunk_text,
                zitierte_entscheidungen=chunk.zitierte_urteile,
            )
            for chunk in chunks
            if chunk.id in filter_output.relevante_chunks
        ]

    @staticmethod
    def _extract_citations_with_rn(text: str) -> list[UTCitation]:
        """Extract citation strings with Randnummern."""
        return citations_from_matches(BVERWG_AZ_RN_ANCHORED.findall(text))
