"""Defines the Temporal Workflow for identifying the Global Table of Contents.

This module implements the `InhaltsverzeichnisFinderWorkflow`, which orchestrates
a multi-stage filtering pipeline to locate the single master index ("Globales
Inhaltsverzeichnis") within a project's document set.

The workflow executes the following logical steps:
1.  **Data Ingestion:** Fetches document metadata and text chunks in parallel
    via the Content Extraction Service.
2.  **Candidate Identification:** Applies a high-recall LLM classification to
    find all chunks that resemble a list or table.
3.  **Candidate Verification:** Applies a high-precision, context-aware LLM
    check (using file names and summaries) to distinguish the Global TOC
    from local indices, bibliographies, or checklists.
4.  **Sequence Expansion:** Analyzes subsequent chunks to reconstruct TOCs
    that span multiple pages.
"""

from datetime import timedelta

from temporal.contracts import (
    DocumentTypeDefinition,
    InhaltsverzeichnisDocumentData,
    InhaltsverzeichnisFinderOutput,
    InhaltsverzeichnisFinderParams,
)
from temporal.registry import FORMALE_PRUEFUNG_INHALTSVERZEICHNIS_FINDER_WORKFLOW
from temporal.utils import sliding_window
from temporalio import workflow
from temporalio.common import RetryPolicy

from src.activities.dms_activities import (
    get_inhalts_extraktion_doc_chunks,
    get_inhalts_extraktion_docs,
)
from src.activities.inhaltsverzeichnis_finder_activities import (
    llm_chunk_classification,
    llm_connected_chunk_classification,
    llm_document_type_description_generation,
    llm_inhaltsverzeichnis_parser,
    llm_overall_classification,
    llm_select_global_inhaltsverzeichnis_document_name,
)
from src.config.config import config
from src.schemas.dms_schemas import (
    ChunkMetadata,
    DMSInhaltsExtraction,
    DocumentChunk,
    InhaltsExtraktionChunksActivityParams,
)
from src.schemas.inhaltsverzeichnis_finder_schemas import (
    CandidateDoc,
    ChunkLLMClassificationActivityParams,
    ChunkOutput,
    ConnectedChunkLLMClassificationActivityParams,
    DocumentTypeDescriptionGenerationActivityInput,
    DocumentTypeDescriptionResult,
    InhaltsverzeichnisClassificationResult,
    InhaltsverzeichnisEntry,
    InhaltsverzeichnisParserActivityInput,
    MergedDocumentChunk,
    OverallLLMClassificationActivityParams,
    ProcessedInhaltsExtraction,
    SelectInhaltsverzeichnisLLMActivityParams,
)


@workflow.defn(name=FORMALE_PRUEFUNG_INHALTSVERZEICHNIS_FINDER_WORKFLOW.name)
class InhaltsverzeichnisFinderWorkflow:
    """Workflow to identify and extract Table of Contents (TOC) from project documents.

    This workflow performs a multi-stage filtering process:
    1. Fetches all documents and their chunks.
    2. Classifies individual chunks to find potential TOCs.
    3. Verifies candidates using document summaries.
    4. Expands the TOC by checking strictly connected chunks.
    5. Parses found giv string in JSON output using LLM
    """

    @workflow.run
    async def run(self, params: InhaltsverzeichnisFinderParams) -> InhaltsverzeichnisFinderOutput:
        """Orchestrates the TOC finding process.

        Args:
            params: Workflow execution parameters (timeouts, project ID, etc.).

        Returns:
            The identified file name and TOC chunks, or None if no unique
            TOC could be determined.
        """
        workflow.logger.info(f"Running workflow for project {params.project_id}")
        reference_document_types = params.document_types

        # Step 1: Fetch all data (Titles -> Chunks)
        all_docs_data = await self._fetch_project_data(params)

        # Step 2: Find initial candidates
        candidates = await self._identify_candidates(all_docs_data, params)

        # Step 3: Verify candidates
        best_candidate = await self._resolve_best_candidate_doc(candidates, params)

        if not best_candidate:
            workflow.logger.info("No unique TOC document found.")
            return InhaltsverzeichnisFinderOutput(
                status="no_inhaltsverzeichnis_found",
                metadata=None,
                document_types=None,
                inhaltsverzeichnis_entries=None,
            )

        # Step 4: Expand TOC (Connected Chunks)
        final_processed_chunks = await self._expand_toc_sequence(best_candidate, params)
        final_chunks = [
            ChunkOutput(chunk_id=chunk.chunk_id, page_content=chunk.page_content)
            for fp in final_processed_chunks
            for chunk in fp.original_chunks
        ]

        # Step 5: LLM parsing final_chunks
        inhaltsverzeichnis_entries = (
            await llm_inhaltsverzeichnis_parser(InhaltsverzeichnisParserActivityInput(chunk_list=final_chunks))
        ).entries

        # Step 6: Context enrichment
        document_types = await self._llm_document_type_description_generation(
            inhaltsverzeichnis_entries=inhaltsverzeichnis_entries,
            reference_document_types=reference_document_types,
        )

        return InhaltsverzeichnisFinderOutput(
            status="success",
            metadata=InhaltsverzeichnisDocumentData(
                document_id=best_candidate.data.dms_document.document_id,
                document_name=best_candidate.data.dms_document.document_name,
                chunks=final_chunks,
            ),
            document_types=document_types,
            inhaltsverzeichnis_entries=inhaltsverzeichnis_entries,
        )

    async def _fetch_project_data(self, params: InhaltsverzeichnisFinderParams) -> list[ProcessedInhaltsExtraction]:
        """Fetches document chunks and merges them based on length constraints.

        Args:
            params: Workflow parameters containing project ID.

        Returns:
            A list of results where small chunks are merged into `MergedDocumentChunk`
            objects, preserving references to the original chunks.
        """
        dms_documents = await workflow.execute_activity(
            get_inhalts_extraktion_docs,
            params.project_id,
            start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
            retry_policy=RetryPolicy(maximum_attempts=config.TEMPORAL.ACTIVITY_MAX_RETRIES),
        )

        async def fetch_doc_chunks(idx: int) -> tuple[int, DMSInhaltsExtraction]:
            return idx, await workflow.execute_activity(
                get_inhalts_extraktion_doc_chunks,
                InhaltsExtraktionChunksActivityParams(
                    dms_document=dms_documents[idx],
                    n_pages=config.INHALTSVERZEICHNIS_FINDER.N_PAGE_SEARCH,
                    include_summary=True,
                ),
                start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
                retry_policy=RetryPolicy(maximum_attempts=config.TEMPORAL.ACTIVITY_MAX_RETRIES),
            )

        indexed = await sliding_window(
            list(range(len(dms_documents))),
            fetch_doc_chunks,
            concurrency=config.TEMPORAL.LLM_MAX_CONCURRENT_ACTIVITIES,
        )
        raw_results: list[DMSInhaltsExtraction] = [r for _, r in sorted(indexed)]
        failed = [e for e in raw_results if e.error]
        failure_rate = len(failed) / len(dms_documents) if dms_documents else 1
        failure_threshold = config.INHALTSVERZEICHNIS_FINDER.EXTRACTION_ERROR_TOLERANCE_RATIO
        if failure_rate > failure_threshold:
            error_msg = (
                f"{len(failed)}/{len(dms_documents)} documents failed extraction "
                f"({failure_rate:.2%}), exceeding threshold of {failure_threshold:.2%}: "
            )
            workflow.logger.error(error_msg)
            raise RuntimeError(error_msg)
        return [
            ProcessedInhaltsExtraction(
                dms_document=doc,
                chunks=self._merge_document_chunks(res.chunks),
                summary=res.summary,
            )
            for doc, res in zip(dms_documents, raw_results, strict=True)
            if not res.error
        ]

    def _merge_document_chunks(self, chunks: list[DocumentChunk]) -> list[MergedDocumentChunk]:
        """
        Groups document chunks into larger merged objects based on a minimum length.

        Args:
            chunks: A list of individual document chunks to be processed.

        Returns:
            A list of merged chunks where each meets the length constraint (unless it is the only chunk).
        """
        merged_output: list[MergedDocumentChunk] = []
        buffer: list[DocumentChunk] = []
        buffer_len = 0
        min_len = config.INHALTSVERZEICHNIS_FINDER.MIN_CHUNK_LENGTH

        for chunk in chunks:
            buffer.append(chunk)
            buffer_len += len(chunk.page_content)

            if buffer_len >= min_len:
                merged_output.append(self._create_merged_chunk(buffer))
                buffer, buffer_len = [], 0

        if buffer:
            if merged_output:
                last_chunks = merged_output[-1].original_chunks + buffer
                merged_output[-1] = self._create_merged_chunk(last_chunks)
            else:
                merged_output.append(self._create_merged_chunk(buffer))

        return merged_output

    def _create_merged_chunk(self, chunks: list[DocumentChunk]) -> MergedDocumentChunk:
        """
        Helper to instantiate a MergedDocumentChunk from a list of chunks.

        Args:
            chunks: The list of document chunks to combine.

        Returns:
            A MergedDocumentChunk with combined text, references, and sorted metadata.
        """
        return MergedDocumentChunk(
            merged_page_content="\n".join(c.page_content for c in chunks),
            original_chunks=list(chunks),
            metadata=ChunkMetadata(page_numbers=sorted({p for c in chunks for p in c.metadata.page_numbers})),
        )

    async def _identify_candidates(
        self,
        docs: list[ProcessedInhaltsExtraction],
        params: InhaltsverzeichnisFinderParams,
    ) -> list[CandidateDoc]:
        """Runs LLM classification on chunks to find potential TOC candidates.

        Args:
            docs: List of document data.
            params: Workflow parameters.

        Returns:
            A list of CandidateDoc objects for files that tested positive.
        """
        items = [(doc_idx, chunk_idx) for doc_idx, doc in enumerate(docs) for chunk_idx in range(len(doc.chunks))]

        async def classify_chunk(
            item: tuple[int, int],
        ) -> tuple[int, int, InhaltsverzeichnisClassificationResult]:
            doc_idx, chunk_idx = item
            result = await llm_chunk_classification(
                ChunkLLMClassificationActivityParams(
                    chunk=docs[doc_idx].chunks[chunk_idx].merged_page_content,
                )
            )
            return doc_idx, chunk_idx, result

        flat_results = await sliding_window(
            items,
            classify_chunk,
            concurrency=config.TEMPORAL.LLM_MAX_CONCURRENT_ACTIVITIES,
        )

        per_doc: dict[int, list[tuple[int, InhaltsverzeichnisClassificationResult]]] = {}
        for doc_idx, chunk_idx, result in flat_results:
            per_doc.setdefault(doc_idx, []).append((chunk_idx, result))

        all_results: list[list[InhaltsverzeichnisClassificationResult]] = [
            [r for _, r in sorted(per_doc.get(i, []))] for i in range(len(docs))
        ]

        candidates = []
        for doc, results in zip(docs, all_results, strict=True):
            classification_results_for_doc = [res.is_global_inhalts_verzeichnis for res in results]
            if any(classification_results_for_doc):
                start_index = next(
                    i for i, is_inhaltsverzeichnis in enumerate(classification_results_for_doc) if is_inhaltsverzeichnis
                )
                candidates.append(CandidateDoc(data=doc, start_index=start_index))

        return candidates

    async def _resolve_best_candidate_doc(
        self,
        candidates: list[CandidateDoc],
        params: InhaltsverzeichnisFinderParams,
    ) -> CandidateDoc | None:
        """Refines potential candidates to identify the single global Table of Contents.

        This method performs a two-stage filtering process:
        1.  Content Verification: Runs a parallel LLM classification on all
            candidates (checking summary & chunk content) to verify if they are
            structurally global.
        2.  Filename Tie-Breaking: If multiple candidates pass step 1,
            it calls a specialized heuristic LLM to select the best candidate
            based strictly on naming conventions.

        Args:
            candidates: List of potential candidates identified by the
                initial classification step.
            params: Workflow parameters containing timeouts and configuration.

        Returns:
            The single confirmed CandidateDoc object, or None if no
            suitable candidate is found.
        """
        if not candidates:
            return None

        async def classify_candidate(
            idx: int,
        ) -> tuple[int, InhaltsverzeichnisClassificationResult]:
            c = candidates[idx]
            return idx, await llm_overall_classification(
                OverallLLMClassificationActivityParams(
                    document_name=c.data.dms_document.document_name,
                    document_summary=c.data.summary or "",
                    chunk=c.data.chunks[c.start_index].merged_page_content,
                )
            )

        indexed = await sliding_window(
            list(range(len(candidates))),
            classify_candidate,
            concurrency=config.TEMPORAL.LLM_MAX_CONCURRENT_ACTIVITIES,
        )
        results: list[InhaltsverzeichnisClassificationResult] = [r for _, r in sorted(indexed)]
        classification_results = [res.is_global_inhalts_verzeichnis for res in results]

        confirmed_candidates = [
            cand for cand, is_confirmed in zip(candidates, classification_results, strict=True) if is_confirmed
        ]

        if not confirmed_candidates:
            return None

        if len(confirmed_candidates) == 1:
            return confirmed_candidates[0]

        selected_candidate_idx = await llm_select_global_inhaltsverzeichnis_document_name(
            SelectInhaltsverzeichnisLLMActivityParams(
                document_names=[c.data.dms_document.document_name for c in confirmed_candidates],
            )
        )

        if selected_candidate_idx is None:
            return None

        selected_candidate = confirmed_candidates[selected_candidate_idx]

        return selected_candidate

    async def _expand_toc_sequence(
        self,
        candidate: CandidateDoc,
        params: InhaltsverzeichnisFinderParams,
    ) -> list[MergedDocumentChunk]:
        """Expands the TOC by checking subsequent chunks for connectivity.

        Args:
            candidate: The chosen document candidate.
            params: Workflow parameters.

        Returns:
            A list of chunks representing the full connected TOC.
        """
        all_chunks = candidate.data.chunks
        current_idx = candidate.start_index

        toc_content = [all_chunks[current_idx]]

        # Iterates over the chunks to combine the TOC sequentially. Parallelisation not
        # easily possible due to early stopping and not needed as this is not a bottleneck
        for i in range(current_idx + 1, len(all_chunks)):
            prev_chunk_text = all_chunks[i - 1].merged_page_content
            curr_chunk_text = all_chunks[i].merged_page_content

            is_connected = await llm_connected_chunk_classification(
                ConnectedChunkLLMClassificationActivityParams(
                    first_chunk=prev_chunk_text,
                    second_chunk=curr_chunk_text,
                )
            )

            if is_connected:
                toc_content.append(all_chunks[i])
            else:
                break

        return toc_content

    async def _llm_document_type_description_generation(
        self,
        inhaltsverzeichnis_entries: list[InhaltsverzeichnisEntry],
        reference_document_types: list[DocumentTypeDefinition],
    ) -> list[DocumentTypeDefinition]:
        """Enriches parsed TOC entries with semantic descriptions via parallel LLM calls.

        This method performs a fan-out operation, triggering a separate LLM activity for
        every entry in the provided list. Each activity generates a detailed description
        (`document_type_description`) for that specific entry based on its title and
        hierarchy. The results are then aggregated and combined with the original
        entry data to form complete document type definitions.

        Args:
            inhaltsverzeichnis_entries (List[InhaltsverzeichnisEntry]): The list of
                parsed TOC leaf entries (containing titles, numbers, and hierarchy paths)
                to be processed.
            reference_document_types: Canonical document definitions used as examples.

        Returns:
            List[DocumentTypeDefinition]: A list of fully defined document types, where:
            - `category` is the flattened hierarchy path (joined by ' > ').
            - `document_type_name` is the concatenation of the entry number and title.
            - `document_type_description` is the text generated by the LLM.
        """

        async def generate_description(
            idx: int,
        ) -> tuple[int, DocumentTypeDescriptionResult]:
            entry = inhaltsverzeichnis_entries[idx]
            return idx, await llm_document_type_description_generation(
                DocumentTypeDescriptionGenerationActivityInput(
                    hierarchy_path=entry.hierarchy_path,
                    entry_title=entry.entry_title,
                    entry_number=entry.entry_number,
                    document_types=reference_document_types,
                )
            )

        indexed = await sliding_window(
            list(range(len(inhaltsverzeichnis_entries))),
            generate_description,
            concurrency=config.TEMPORAL.LLM_MAX_CONCURRENT_ACTIVITIES,
        )
        description_results: list[DocumentTypeDescriptionResult] = [r for _, r in sorted(indexed)]

        results: list[DocumentTypeDefinition] = [
            DocumentTypeDefinition(
                category=" > ".join(entry.hierarchy_path) if entry.hierarchy_path else None,
                document_type_name=entry.entry_title,
                document_type_description=f"{entry.entry_number}: {description_result.document_type_description}"
                if entry.entry_number
                else description_result.document_type_description,
            )
            for description_result, entry in zip(description_results, inhaltsverzeichnis_entries, strict=True)
        ]
        return results
