import asyncio
from typing import Any

from pydantic import BaseModel
from temporal.utils import sliding_window
from temporalio import workflow

from src.activities.law_api_calls import (
    QueryChunksUTInput,
    QueryKResultsUTInput,
    UTNorms,
    query_chunks_ut,
    query_k_results_ut,
)
from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_types import (
    UTChunk,
    UTCitation,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.bverwg_citations import (
    BVERWG_AZ_RN,
    citations_from_matches,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.retrieval_types import (
    UrteileKontextRetrievalWorkflowInput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.urteile.ukr_data_format import (
    RelevantChunk,
    UrteileKontextAnalysisOutput,
    UrteileKontextAnalysisWithFollowUpQueriesOutput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.urteile.ukr_prompt import (
    ukr_prompt,
    ukr_prompt_w_fq,
)


@workflow.defn(name="UrteileKontextRetrievalAgentWorkflow")
class UrteileKontextRetrievalAgentWorkflow:
    @workflow.run
    async def run(
        self,
        input: UrteileKontextRetrievalWorkflowInput,
    ) -> list[UTChunk]:
        ut_chunks = await self._fetch_and_enrich_ut_chunks(input)
        if not ut_chunks:
            return []

        analysis_output = await self._analyse_chunks(
            input.begriff, ut_chunks, ukr_prompt_w_fq, UrteileKontextAnalysisWithFollowUpQueriesOutput
        )
        relevant_chunks = self._filter_by_relevant_keys(ut_chunks, analysis_output.relevant_chunks)
        topic_chunk_lists = await self._retrieve_topic_chunks(analysis_output.follow_up_queries, input)

        existing_keys: set[tuple[str, str]] = {(c.aktenzeichen, c.section_number) for c in relevant_chunks}
        all_topic_chunks = self._deduplicate_combined(topic_chunk_lists, existing_keys)
        all_topic_chunks = await self._extract_and_enrich_citations(all_topic_chunks)

        if all_topic_chunks:
            topic_analysis = await self._analyse_chunks(
                input.begriff, all_topic_chunks, ukr_prompt, UrteileKontextAnalysisOutput
            )
            relevant_topic_chunks = self._filter_by_relevant_keys(all_topic_chunks, topic_analysis.relevant_chunks)
        else:
            relevant_topic_chunks: list[UTChunk] = []

        return self._combine_results(relevant_chunks, relevant_topic_chunks)

    async def _fetch_and_enrich_ut_chunks(self, input: UrteileKontextRetrievalWorkflowInput) -> list[UTChunk]:
        """Fetch initial UT chunks, extract citations, and enrich with citation context."""
        k_results_ut = await query_k_results_ut(
            QueryKResultsUTInput(
                query_text=input.begriff,
                norms=[
                    UTNorms(
                        name=input.name,
                        name_suffix=input.name_suffix,
                        paragraph=f"§ {input.paragraph_nr}",
                        absatz=f"Abs {input.absatz_nr}",
                    )
                ],
                k=20,
            )
        )
        if not k_results_ut:
            return []

        ut_chunks = [UTChunk.model_validate(r) for r in k_results_ut]

        return await self._extract_and_enrich_citations(ut_chunks)

    async def _extract_and_enrich_citations(self, chunks: list[UTChunk]) -> list[UTChunk]:
        """Extract citations from chunks and enrich them with citation text."""
        chunks = [self._extract_citations_with_rn(c) for c in chunks]
        all_citations = self._get_unique_citations(chunks)
        if not all_citations:
            return chunks

        async def _fetch_citation_chunks(c: UTCitation) -> list[dict[str, Any]]:
            return await query_chunks_ut(
                QueryChunksUTInput(aktenzeichen=c.aktenzeichen, section_number=int(c.randnummer))
            )

        citation_chunk_lists = await sliding_window(all_citations, _fetch_citation_chunks, concurrency=10)
        citation_results = [UTChunk.model_validate(chunk) for chunks in citation_chunk_lists for chunk in chunks]

        return self._enrich_citation_chunks_with_text(chunks, citation_results)

    async def _analyse_chunks[TOutput: BaseModel](
        self, begriff: str, ut_chunks: list[UTChunk], prompt_template: str, output_class: type[TOutput]
    ) -> TOutput:
        """Run LLM analysis on chunks with the given prompt and output format."""
        chunks_for_llm = [
            {
                "aktenzeichen": c.aktenzeichen,
                "randnummer": c.section_number,
                "datum": c.datum,
                "text": c.section_text,
                "zitierte_entscheidungen": [ci.model_dump() for ci in c.zitierte_urteile],
                "similarity": c.similarity,
            }
            for c in ut_chunks
        ]
        return await llm_invoke(
            activity_input={
                "model_name": ENV.MODELS.LARGE_LLM,
                "temperature": 0,
                "thinking": False,
                "prompt_template": prompt_template,
                "input_dict": {
                    "unbestimmter_rechtsbegriff": begriff,
                    "chunks": chunks_for_llm,
                },
            },
            output_class=output_class,
        )

    @staticmethod
    def _filter_by_relevant_keys(
        ut_chunks: list[UTChunk], relevant_chunks_output: list[RelevantChunk]
    ) -> list[UTChunk]:
        relevant_keys = {(r.aktenzeichen, r.randnummer) for r in relevant_chunks_output}
        return [c for c in ut_chunks if (c.aktenzeichen, c.section_number) in relevant_keys]

    async def _retrieve_topic_chunks(
        self, queries: list[str], input: UrteileKontextRetrievalWorkflowInput
    ) -> list[list[UTChunk]]:
        """Retrieve additional topic-specific chunks via follow-up queries in parallel."""
        norm = UTNorms(
            name=input.name,
            name_suffix=input.name_suffix,
            paragraph=f"§ {input.paragraph_nr}",
            absatz=f"Abs {input.absatz_nr}",
        )
        topic_chunk_lists = await asyncio.gather(
            *[query_k_results_ut(QueryKResultsUTInput(query_text=q, norms=[norm], k=10)) for q in queries]
        )
        return [[UTChunk.model_validate(c) for c in chunks] for chunks in topic_chunk_lists]

    @classmethod
    def _combine_results(
        cls,
        relevant_chunks: list[UTChunk],
        relevant_topic_chunks: list[UTChunk],
    ) -> list[UTChunk]:
        """Merge relevant and deduplicated topic chunks into the final result list."""
        n = cls._calculate_final_results_count(len(relevant_chunks))
        return relevant_chunks + relevant_topic_chunks[:n]

    @staticmethod
    def _deduplicate_combined(
        topic_chunk_lists: list[list[UTChunk]], existing_keys: set[tuple[str, str]]
    ) -> list[UTChunk]:
        """Flatten and deduplicate topic chunk lists, excluding already-known chunks."""
        seen = set(existing_keys)
        result: list[UTChunk] = []
        for chunks in topic_chunk_lists:
            for c in chunks:
                key = (c.aktenzeichen, c.section_number)
                if key not in seen:
                    result.append(c)
                    seen.add(key)
        return result

    @staticmethod
    def _extract_citations_with_rn(chunk: UTChunk) -> UTChunk:
        if chunk.gericht != "BVerwG":
            return chunk
        return chunk.model_copy(
            update={"zitierte_urteile": citations_from_matches(BVERWG_AZ_RN.findall(chunk.section_text))}
        )

    @staticmethod
    def _get_unique_citations(results: list[UTChunk]) -> list[UTCitation]:
        by_key: dict[tuple[str, str], UTCitation] = {
            (citation.aktenzeichen, citation.randnummer): citation for r in results for citation in r.zitierte_urteile
        }
        return list(by_key.values())

    @staticmethod
    def _enrich_citation_chunks_with_text(
        source_chunks: list[UTChunk], citation_chunks: list[UTChunk]
    ) -> list[UTChunk]:
        cc_lookup: dict[tuple[str, str], list[str]] = {}
        for cc in citation_chunks:
            key = (cc.aktenzeichen, cc.section_number)
            cc_lookup.setdefault(key, []).append(cc.section_text)

        result = []
        for source in source_chunks:
            enriched = []
            for citation in source.zitierte_urteile:
                texts = cc_lookup.get((citation.aktenzeichen, citation.randnummer))
                if texts:
                    for text in texts:
                        enriched.append(citation.model_copy(update={"text": text}))
            result.append(source.model_copy(update={"zitierte_urteile": enriched}))
        return result

    @staticmethod
    def _calculate_final_results_count(relevant_count: int) -> int:
        n = max(10 - relevant_count, 6)
        return n if n % 2 == 0 else n + 1
