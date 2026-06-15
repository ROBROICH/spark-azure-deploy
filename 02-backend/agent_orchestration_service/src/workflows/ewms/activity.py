from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any
from uuid import UUID

from event_logging.enums import EventAction, EventCategory, EventOutcome
from pydantic import BaseModel
from temporal.workflows.einwendungsmanagement.types import (
    ArgumentClassificationOutput,
    ArgumentExtractionOutput,
    ArgumentSubtopic,
    ArgumentTopic,
)
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.models.schemas.ewms import (
    ClassificationRequest,
    ClassifiedArgumentRequest,
    InjectionDetectedDocument,
    InjectionDetectedRequest,
)
from src.services.api_clients import FilesApiClient, ObjectionsServiceClient, PlsApiClient
from src.utils.logger import logger
from src.workflows.pls_topic_graph import TopicTree, fetch_topic_trees

EWMS_DOCUMENT_FILE_TYPE = "ewms_document"
_API_TIMEOUT = timedelta(seconds=60)

_api_retry_policy = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(seconds=30),
)


async def api_call[ArgT, ReturnT](
    activity_fn: Callable[[ArgT], Awaitable[ReturnT]],
    arg: ArgT,
) -> ReturnT:
    """Execute an activity with the shared API timeout/retry defaults."""
    return await workflow.execute_activity(
        activity_fn,
        arg,
        start_to_close_timeout=_API_TIMEOUT,
        retry_policy=_api_retry_policy,
    )


class EWMSDocumentsInput(BaseModel):
    file_ids: list[UUID]
    document_names_by_id: dict[str, str]


class StoreExtractionInput(BaseModel):
    project_id: UUID
    extraction_output: ArgumentExtractionOutput
    document_names_by_id: dict[str, str]
    markdown_by_id: dict[str, str]


class FetchEWMSDocumentsInput(BaseModel):
    project_id: UUID
    file_ids: list[UUID]


class StoreClassificationInput(BaseModel):
    project_id: UUID
    classification_output: ArgumentClassificationOutput


class MarkClassificationFailedInput(BaseModel):
    project_id: UUID
    beteiligungs_eingang_ids: list[UUID]


@activity.defn
async def _fetch_ewms_documents(input: FetchEWMSDocumentsInput) -> EWMSDocumentsInput:
    files = [await FilesApiClient.get_file_by_id(file_id) for file_id in input.file_ids]
    invalid_files = [
        file.id for file in files if file.project_id != input.project_id or file.type != EWMS_DOCUMENT_FILE_TYPE
    ]
    if invalid_files:
        raise ValueError(
            "EWMS workflow received file IDs that are not EWMS documents "
            f"for project {input.project_id}: {invalid_files}"
        )

    return EWMSDocumentsInput(
        file_ids=input.file_ids,
        document_names_by_id={str(file.id): file.filename for file in files},
    )


@activity.defn
async def _fetch_processed_file_ids(project_id: str) -> list[UUID]:
    return await ObjectionsServiceClient.list_processed_file_ids(UUID(project_id))


@activity.defn
async def _fetch_argument_topics(project_id: str) -> list[ArgumentTopic]:
    """Fetch the project's argument topics from PLS.

    PLS exposes these as "topics"; we surface them as `ArgumentTopic` in
    the EWMS domain.
    """
    project_uuid = UUID(project_id)
    topic_trees = await fetch_topic_trees(PlsApiClient, project_id=project_uuid)
    if not topic_trees:
        logger.warn(
            action=EventAction.ACCESS,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.SERVICE,
            message=f"No project topics found for project {project_id} — classification will be skipped.",
        )
    return _argument_topics_from_topic_trees(topic_trees)


def _argument_topics_from_topic_trees(topic_trees: list[TopicTree]) -> list[ArgumentTopic]:
    return [
        ArgumentTopic(
            topic_id=topic_tree.topic.id,
            name=topic_tree.topic.name,
            description=topic_tree.topic.description or "",
            subtopics=[
                ArgumentSubtopic(
                    topic_id=subtopic.id,
                    name=subtopic.name,
                    description=subtopic.description or "",
                )
                for subtopic in topic_tree.subtopics
                if subtopic.show_in_ewm
            ],
        )
        for topic_tree in topic_trees
        if topic_tree.topic.show_in_ewm
    ]


@activity.defn
async def _store_extraction_results(input: StoreExtractionInput) -> dict[str, Any]:
    payload = input.extraction_output.model_dump(mode="json")
    for doc_args in payload["document_arguments"]:
        document_id = doc_args["document_id"]
        doc_args["document_name"] = input.document_names_by_id.get(document_id, document_id)
        doc_args["beteiligungs_eingang_markdown"] = input.markdown_by_id.get(document_id)

    return await ObjectionsServiceClient.store_extraction_results(
        project_id=input.project_id,
        payload=payload,
    )


@activity.defn
async def _store_classification_results(input: StoreClassificationInput) -> dict[str, Any]:
    classified: list[ClassifiedArgumentRequest] = []
    unclassified_argument_ids: list[UUID] = []
    for ca in input.classification_output.classified_arguments:
        if ca.topic is None:
            unclassified_argument_ids.append(ca.argument_record.argument_id)
        else:
            classified.append(
                ClassifiedArgumentRequest(
                    argument_id=ca.argument_record.argument_id,
                    topic_id=ca.topic.topic_id,
                    sub_topic_id=ca.subtopic.topic_id if ca.subtopic is not None else None,
                )
            )
    payload = ClassificationRequest(
        classified_arguments=classified,
        unclassified_argument_ids=unclassified_argument_ids,
    )
    return await ObjectionsServiceClient.store_classification_results(
        project_id=input.project_id,
        payload=payload,
    )


@activity.defn
async def _mark_classification_failed(input: MarkClassificationFailedInput) -> dict[str, Any]:
    return await ObjectionsServiceClient.mark_classification_failed(
        project_id=input.project_id,
        payload={
            "beteiligungs_eingang_ids": [str(be_id) for be_id in input.beteiligungs_eingang_ids],
        },
    )


class StoreInjectionInput(BaseModel):
    project_id: UUID
    documents: list[InjectionDetectedDocument]


@activity.defn
async def _store_injection_results(input: StoreInjectionInput) -> dict[str, Any]:
    return await ObjectionsServiceClient.mark_injection_detected(
        project_id=input.project_id,
        payload=InjectionDetectedRequest(documents=input.documents),
    )
