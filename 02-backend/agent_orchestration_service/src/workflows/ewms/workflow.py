from typing import Any
from uuid import UUID

from pydantic import BaseModel
from temporal.utils import sliding_window
from temporal.workflows.einwendungsmanagement.argument_classification import (
    execute_argument_classification_workflow,
)
from temporal.workflows.einwendungsmanagement.argument_extraction import (
    execute_argument_extraction_workflow,
)
from temporal.workflows.einwendungsmanagement.types import (
    ArgumentClassificationOutput,
    ArgumentClassificationParams,
    ArgumentExtractionOutput,
    ArgumentExtractionParams,
    ArgumentRecord,
    ArgumentTopic,
)
from temporal.workflows.inhaltsextraktion.process_documents_ewms import (
    execute_process_documents_ewms_workflow,
)
from temporal.workflows.inhaltsextraktion.types import (
    ProcessDocumentsEWMSWorkflowInput,
    SingleDocumentEWMSWorkflowOutput,
)
from temporal.workflows.orchestrator.ewms import (
    EWMS_ORCHESTRATOR_TASK_QUEUE,
    EWMS_ORCHESTRATOR_WORKFLOW_ID,
    EWMSOrchestratorWorkflowInput,
    EWMSOrchestratorWorkflowOutput,
)
from temporalio import workflow

from src.models.schemas.ewms import InjectionDetectedDocument
from src.workflows.ewms.activity import (
    EWMSDocumentsInput,
    FetchEWMSDocumentsInput,
    MarkClassificationFailedInput,
    StoreClassificationInput,
    StoreExtractionInput,
    StoreInjectionInput,
    _fetch_argument_topics,
    _fetch_ewms_documents,
    _mark_classification_failed,
    _store_classification_results,
    _store_extraction_results,
    _store_injection_results,
    api_call,
)


class EWMSEntrypointWorkflowInput(BaseModel):
    project_id: UUID
    file_id: UUID


class EWMSEntrypointWorkflowOutput(BaseModel):
    pass


_EWMS_ENTRYPOINT_CONCURRENCY = 10


def _split_by_injection(
    outputs: list[SingleDocumentEWMSWorkflowOutput],
) -> tuple[list[SingleDocumentEWMSWorkflowOutput], list[SingleDocumentEWMSWorkflowOutput]]:
    """Return (clean, injected) partitions."""
    clean = [o for o in outputs if not o.prompt_injection.injection_detected]
    injected = [o for o in outputs if o.prompt_injection.injection_detected]
    return clean, injected


def _extraction_results_by_document_id(extraction_response: dict[str, Any]) -> dict[UUID, dict[str, Any]]:
    results_by_document_id: dict[UUID, dict[str, Any]] = {}
    for result in extraction_response.get("results", []):
        document_id = UUID(str(result["document_id"]))
        if document_id in results_by_document_id:
            raise ValueError(f"OMS returned duplicate extraction result for document {document_id}")
        results_by_document_id[document_id] = result
    return results_by_document_id


@workflow.defn(name=EWMS_ORCHESTRATOR_WORKFLOW_ID)
class EWMSOrchestratorWorkflow:
    @workflow.run
    async def run(self, input: EWMSOrchestratorWorkflowInput) -> EWMSOrchestratorWorkflowOutput:
        async def run_entrypoint(file_id: UUID) -> EWMSEntrypointWorkflowOutput:
            return await workflow.execute_child_workflow(
                EWMSEntrypointWorkflow.run,
                EWMSEntrypointWorkflowInput(project_id=input.project_id, file_id=file_id),
                id=f"ewms-entrypoint-{workflow.uuid4()}",
                task_queue=EWMS_ORCHESTRATOR_TASK_QUEUE,
            )

        await sliding_window(
            input.file_ids,
            run_entrypoint,
            _EWMS_ENTRYPOINT_CONCURRENCY,
        )
        return EWMSOrchestratorWorkflowOutput()


@workflow.defn(name="EWMSEntrypointWorkflow")
class EWMSEntrypointWorkflow:
    @workflow.run
    async def run(self, input: EWMSEntrypointWorkflowInput) -> EWMSEntrypointWorkflowOutput:
        project_id = input.project_id
        project_id_str = str(project_id)
        ewms_documents = await api_call(
            _fetch_ewms_documents,
            FetchEWMSDocumentsInput(project_id=project_id, file_ids=[input.file_id]),
        )
        processed_files_output = await self._run_ewms_extraction(project_id, input.file_id)

        # Split before any LLM call — injected content must not reach argument extraction
        clean, injected = _split_by_injection(processed_files_output)

        if injected:
            await self._store_injection_results(project_id, ewms_documents, injected)

        if not clean:
            return EWMSEntrypointWorkflowOutput()

        argument_records, beteiligungs_eingang_ids = await self._extract_and_persist_arguments(
            project_id, ewms_documents, clean
        )
        if not argument_records:
            return EWMSEntrypointWorkflowOutput()

        topics = await api_call(_fetch_argument_topics, project_id_str)
        if not topics:
            await self._mark_classification_failed(project_id, beteiligungs_eingang_ids)
            return EWMSEntrypointWorkflowOutput()

        try:
            classification_output = await self._classify_arguments(project_id_str, argument_records, topics)
            await self._persist_classification(project_id, classification_output)
        except Exception:
            await self._mark_classification_failed(project_id, beteiligungs_eingang_ids)
            return EWMSEntrypointWorkflowOutput()

        return EWMSEntrypointWorkflowOutput()

    async def _store_injection_results(
        self,
        project_id: UUID,
        ewms_documents: EWMSDocumentsInput,
        injected: list[SingleDocumentEWMSWorkflowOutput],
    ) -> None:
        if not injected:
            return
        documents = [
            InjectionDetectedDocument(
                file_id=UUID(str(output.original_file_id)),
                document_name=ewms_documents.document_names_by_id.get(
                    str(output.original_file_id),
                    str(output.original_file_id),
                ),
                snippet=output.prompt_injection.snippet,
            )
            for output in injected
        ]
        await api_call(
            _store_injection_results,
            StoreInjectionInput(project_id=project_id, documents=documents),
        )

    async def _run_ewms_extraction(
        self,
        project_id: UUID,
        file_id: UUID,
    ) -> list[SingleDocumentEWMSWorkflowOutput]:
        project_id_str = str(project_id)
        output = await execute_process_documents_ewms_workflow(
            ProcessDocumentsEWMSWorkflowInput(file_ids=[file_id], project_id=project_id),
            project_id=project_id_str,
        )
        return output.processed_files_output

    async def _extract_and_persist_arguments(
        self,
        project_id: UUID,
        ewms_documents: EWMSDocumentsInput,
        processed_files_output: list[SingleDocumentEWMSWorkflowOutput],
    ) -> tuple[list[ArgumentRecord], list[UUID]]:
        """Run ArgumentExtractionWorkflow, persist results.

        Returns the argument records (paired with DB UUIDs) and the list of
        BeteiligungsEingang IDs that were touched — needed so the caller can
        flip their classification_status to FAILED if classification blows up.
        """
        project_id_str = str(project_id)

        extraction_result = await execute_argument_extraction_workflow(
            ArgumentExtractionParams(processed_files_output=processed_files_output),
            project_id=project_id_str,
        )
        extraction_output = ArgumentExtractionOutput.model_validate(extraction_result)
        markdown_by_id = {str(output.original_file_id): output.markdown for output in processed_files_output}

        extraction_response = await api_call(
            _store_extraction_results,
            StoreExtractionInput(
                project_id=project_id,
                extraction_output=extraction_output,
                document_names_by_id=ewms_documents.document_names_by_id,
                markdown_by_id=markdown_by_id,
            ),
        )

        results_by_document_id = _extraction_results_by_document_id(extraction_response)
        argument_records: list[ArgumentRecord] = []
        beteiligungs_eingang_ids: list[UUID] = []
        for doc_args in extraction_output.document_arguments:
            document_id = UUID(doc_args.document_id)
            insert_result = results_by_document_id.get(document_id)
            if insert_result is None:
                raise ValueError(f"OMS returned no extraction result for document {document_id}")

            if insert_result.get("skipped"):
                continue

            be_id = insert_result.get("beteiligungs_eingang_id")
            if be_id is not None:
                beteiligungs_eingang_ids.append(UUID(be_id))

            flat_args = [arg for chunk in doc_args.chunk_arguments for arg in chunk.arguments]
            persisted_args = insert_result.get("arguments", [])

            for extracted, persisted in zip(flat_args, persisted_args, strict=True):
                argument_records.append(
                    ArgumentRecord(argument_id=UUID(str(persisted["argument_id"])), extracted_argument=extracted)
                )

        return argument_records, beteiligungs_eingang_ids

    async def _classify_arguments(
        self,
        project_id_str: str,
        argument_records: list[ArgumentRecord],
        topics: list[ArgumentTopic],
    ) -> ArgumentClassificationOutput:
        classification_result = await execute_argument_classification_workflow(
            ArgumentClassificationParams(
                argument_records=argument_records,
                topics=topics,
            ),
            project_id=project_id_str,
        )
        return ArgumentClassificationOutput.model_validate(classification_result)

    async def _persist_classification(
        self,
        project_id: UUID,
        classification_output: ArgumentClassificationOutput,
    ) -> None:
        await api_call(
            _store_classification_results,
            StoreClassificationInput(
                project_id=project_id,
                classification_output=classification_output,
            ),
        )

    async def _mark_classification_failed(
        self,
        project_id: UUID,
        beteiligungs_eingang_ids: list[UUID],
    ) -> None:
        if not beteiligungs_eingang_ids:
            return
        await api_call(
            _mark_classification_failed,
            MarkClassificationFailedInput(
                project_id=project_id,
                beteiligungs_eingang_ids=beteiligungs_eingang_ids,
            ),
        )
