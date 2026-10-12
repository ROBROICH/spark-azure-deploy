from datetime import timedelta

from temporal.contracts import (
    DMSFileResponse,
    DocumentOutput,
    LLMMatchingOutput,
    LLMMatchingParams,
    MatchedDocumentTypeOutput,
)
from temporal.registry import FORMALE_PRUEFUNG_LLM_MATCHING_WORKFLOW
from temporal.utils import sliding_window
from temporalio import workflow
from temporalio.common import RetryPolicy

from src.activities.dms_activities import (
    UploadTemporalCheckpointInput,
    get_inhalts_extraktion_docs,
    upload_temporal_checkpoint,
)
from src.activities.llm_matching_activities import llm_document_grouping
from src.config.config import config
from src.schemas.llm_matching_schemas import (
    DocumentData,
    DocumentGroup,
    DocumentGroupingActivityParams,
    DocumentTypeDefinition,
    SingleDocumentMatchInput,
)
from src.workflows.llm_matching_single_document import LLMMatchingSingleDocumentWorkflow


@workflow.defn(name=FORMALE_PRUEFUNG_LLM_MATCHING_WORKFLOW.name)
class LLMMatchingWorkflow:
    """
    Workflow that matches documents from a project against a predefined list of document
    types using a two-stage LLM process (Summarization -> Matching).
    """

    @workflow.run
    async def run(self, params: LLMMatchingParams) -> DMSFileResponse:
        """
        Orchestrates the document matching process.

        Args:
            params (LLMMatchingParams): Configuration parameters for the workflow,
                including timeouts, paths, and project IDs.

        Returns:
            DMSFileResponse: The result of temporal workflows is uploaded to DMS for
                simple storage, access and to avoid size limitation. It is a json using the
                LLMMatchingOutput format which contains the matched and
                unmatched documents.
        """
        workflow.logger.info(f"Starting LLM Matching Workflow for project {params.project_id}")

        # 1. Load Definitions
        document_types = params.document_types
        if not document_types:
            workflow.logger.warning("No document definitions loaded.")
            empty_output = LLMMatchingOutput(matched_document_types=[], unassigned_documents=[])
            return await self._upload_result(empty_output, params)

        # 2. Fetch Files
        workflow.logger.debug("Fetching project files ...")
        documents = await self._fetch_documents(params=params)

        # 3. Perform Matching
        llm_matching_workflow_output = await self._match_documents(
            docs=documents,
            candidates=document_types,
            params=params,
        )
        # 4. Upload result
        upload = await self._upload_result(llm_matching_workflow_output, params)
        workflow.logger.info("LLM Matching Workflow completed successfully.")
        return upload

    async def _fetch_documents(self, params: LLMMatchingParams) -> list[DocumentData]:
        """
        Fetches documents via activity execution and wraps them into DocumentData objects
        while marking which documents should be classified if params.document_ids is set.

        Args:
            params (LLMMatchingParams): The workflow params containing project_id,
                document_ids.
        Returns:
            List[DocumentData]: A list of prepared document data structures.
        """
        dms_files = await workflow.execute_activity(
            get_inhalts_extraktion_docs,
            params.project_id,
            start_to_close_timeout=timedelta(seconds=config.TEMPORAL.ACTIVITY_TIMEOUT_SECONDS),
            retry_policy=RetryPolicy(maximum_attempts=config.TEMPORAL.ACTIVITY_MAX_RETRIES),
        )
        workflow.logger.info(f"Fetched {len(dms_files)} documents for processing.")
        documents = []
        for d in dms_files:
            should_classify = True
            if params.document_ids and d.document_id not in params.document_ids:
                should_classify = False
            documents.append(
                DocumentData(
                    dms_doc=d,
                    should_classify=should_classify,
                )
            )
        return documents

    async def _process_matching_batch(
        self,
        indices: list[int],
        docs: list[DocumentData],
        candidates: list[DocumentTypeDefinition],
        params: LLMMatchingParams,
    ) -> dict[int, DocumentData]:
        """Executes per-document matching as child workflows with bounded concurrency.

        Each document is processed in its own child workflow, keeping the parent
        workflow history small while the heavy activity history lives in the child.

        Args:
            indices: Indices into ``docs`` that should be matched.
            docs: The master document list (mutated in-place with results).
            candidates: Document type definitions to match against.
            params: Workflow execution parameters.

        Returns:
            Mapping of document index → updated DocumentData.
        """
        docs_batch_size = config.LLM_MATCHING.MAX_CONCURRENT_FILES_FOR_MATCH

        async def match_index(idx: int) -> tuple[int, DocumentData]:
            doc = docs[idx]
            output = await workflow.execute_child_workflow(
                LLMMatchingSingleDocumentWorkflow.run,
                SingleDocumentMatchInput(
                    dms_doc=doc.dms_doc,
                    document_group=doc.document_group,
                    candidates=candidates,
                ),
                id=str(workflow.uuid4()),
                task_queue=workflow.info().task_queue,
                task_timeout=timedelta(seconds=60),
            )
            doc.assigned_document_type = output.assigned_document_type
            doc.reasoning = output.reasoning
            doc.confidence = output.confidence
            return idx, doc

        results = await sliding_window(indices, match_index, concurrency=docs_batch_size)
        return {idx: doc for idx, doc in results}

    async def _match_documents(
        self,
        docs: list[DocumentData],
        candidates: list[DocumentTypeDefinition],
        params: LLMMatchingParams,
    ) -> LLMMatchingOutput:
        """Orchestrates the bulk matching of documents using a grouping optimization strategy.

        This workflow minimizes redundant processing and improves accuracy through a
        "Representative First" strategy:
        1.  **Grouping**: Documents are grouped based on their filenames and parent
            folder context (including Ordner names) to identify clusters of likely
            related files.
        2.  **Representative Matching**: A single representative document from each
            group is identified and matched first.
        3.  **Context Propagation**: The classification result of the representative
            is appended to the group name for the remaining members. For example, if
            the representative is an "Invoice", the group context becomes
            "Invoice - GroupName". This provides a strong hint to the LLM for the
            remaining documents.
        4.  **Remainder Matching**: The remaining non-representative documents are
            processed using this enhanced context.
        5.  **Aggregation**: Results are consolidated. If multiple documents match
            the same type, their confidences are aggregated.

        Args:
            docs_matching_data (List[DocumentMatchingData]): List of all documents
                requiring classification.
            candidates (List[DocumentTypeDefinition]): The definitions of possible
                document types.
            params (LLMMatchingParams): Parameters for timeouts, concurrency, and
                LLM profiles.

        Returns:
            LLMMatchingOutput: The final output separating successfully
            matched document types (with aggregated assigned documents) from
            unassigned documents.
        """
        workflow.logger.info(f"Matching {len(docs)} documents against {len(candidates)} definitions.")
        groups: list[DocumentGroup] = await llm_document_grouping(
            DocumentGroupingActivityParams(
                document_names=[d.dms_doc.document_name for d in docs],
            )
        )
        results = []
        # Normally all groups are eligible; Only different when run on a subset of docs
        eligible_groups = [g for g in groups if any(docs[i].should_classify for i in g.document_indices)]
        repr_indices = [g.representative_index for g in eligible_groups]

        # 1. Process Representatives
        for g in groups:
            docs[g.representative_index].document_group = g.group_name

        repr_results = await self._process_matching_batch(repr_indices, docs, candidates, params)
        for g in eligible_groups:
            result = repr_results[g.representative_index]
            results.append(result)
            group_suffix = (
                f"{result.assigned_document_type.document_type_name} - {g.group_name}"
                if result.assigned_document_type
                else g.group_name
            )
            for member_idx in g.document_indices:
                docs[member_idx].document_group = group_suffix

        # 2. Process Remainder
        non_repr_indices = [i for i in range(len(docs)) if docs[i].should_classify and i not in repr_results]
        remainder_results = await self._process_matching_batch(non_repr_indices, docs, candidates, params)

        for _, result in remainder_results.items():
            results.append(result)
        return await self._build_output(results, candidates)

    async def _build_output(
        self,
        results: list[DocumentData],
        candidates: list[DocumentTypeDefinition],
    ) -> LLMMatchingOutput:
        """Constructs the structured output for the document matching workflow.

        Args:
            results: A list of outcomes generated from the document matching.
            candidates: A list of document type definitions that were used
                as the reference set for the matching task.

        Returns:
            An instance of LLMMatchingOutput containing the
            finalized matching data.
        """
        matched_types: dict[str, MatchedDocumentTypeOutput] = {}
        unassigned_docs: list[DocumentOutput] = []
        seen_document_ids: set[str] = set()

        for document_type in candidates:
            matched_types[document_type.document_type_name] = MatchedDocumentTypeOutput(
                required_document_type=document_type,
                assigned_documents=[],
                confidence=0.0,
            )

        for doc in results:
            if not doc.should_classify:
                continue
            doc_id = str(doc.dms_doc.document_id)
            if doc_id in seen_document_ids:
                workflow.logger.warning(f"Skipping duplicate document_id={doc_id} ('{doc.dms_doc.document_name}')")
                continue
            seen_document_ids.add(doc_id)
            if not doc.assigned_document_type:
                unassigned_docs.append(
                    DocumentOutput(
                        document_name=doc.dms_doc.document_name,
                        document_id=doc.dms_doc.document_id,
                        document_extraction_id=doc.dms_doc.content_extraction_id,
                        reasoning=doc.reasoning,
                        confidence=doc.confidence,
                    )
                )
                continue
            type_name = doc.assigned_document_type.document_type_name
            output = DocumentOutput(
                document_name=doc.dms_doc.document_name,
                document_id=doc.dms_doc.document_id,
                document_extraction_id=doc.dms_doc.content_extraction_id,
                reasoning=doc.reasoning,
                confidence=doc.confidence,
            )
            entry = matched_types[type_name]
            if len(entry.assigned_documents) == 0:
                entry.confidence = round(doc.confidence, 2)
            else:
                entry.confidence = round(entry.confidence * doc.confidence, 2)
            entry.assigned_documents.append(output)
        return LLMMatchingOutput(
            matched_document_types=list(matched_types.values()),
            unassigned_documents=unassigned_docs,
        )

    async def _upload_result(
        self,
        output_data: LLMMatchingOutput,
        params: LLMMatchingParams,
    ) -> DMSFileResponse:
        """
        Executes the activity to upload the workflow results to the DMS.

        Args:
            output_data (LLMMatchingOutput): The structured workflow output
                to be serialized and uploaded.
            params (LLMMatchingParams): Workflow parameters containing configuration
                for retries and project identification.

        Returns:
            DMSFileResponse: The response from the DMS upload activity.
        """
        info = workflow.info()
        return await workflow.execute_activity(
            upload_temporal_checkpoint,
            UploadTemporalCheckpointInput(
                project_id=params.project_id,
                workflow_id=info.workflow_id,
                run_id=info.run_id,
                filename="result.json",
                payload=output_data.model_dump(mode="json", by_alias=True),
            ),
            start_to_close_timeout=timedelta(seconds=config.TEMPORAL.UPLOAD_ACTIVITY_TIMEOUT_SECONDS),
            retry_policy=RetryPolicy(maximum_attempts=config.TEMPORAL.ACTIVITY_MAX_RETRIES),
        )
