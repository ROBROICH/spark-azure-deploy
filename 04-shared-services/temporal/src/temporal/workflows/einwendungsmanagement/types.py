from uuid import UUID

from pydantic import BaseModel, Field
from temporal.utils import WorkflowName
from temporal.workflows.inhaltsextraktion.types import (
    ChunkEWMS,
    SingleDocumentEWMSWorkflowOutput,
)

ARGUMENT_EXTRACTION_WORKFLOW_ID = WorkflowName("argument-extraction-workflow")
ARGUMENT_CLASSIFICATION_WORKFLOW_ID = WorkflowName("argument-classification-workflow")
TASK_QUEUE = "einwendungsmanagement"

# ---------------------------------------------------------------------------
# Argument Extraction Types
# ---------------------------------------------------------------------------


class ArgumentExtractionParams(BaseModel):
    """Input parameters for initiating the extraction workflow."""

    processed_files_output: list[SingleDocumentEWMSWorkflowOutput]


class TextSpan(BaseModel):
    """Represents a character range within a specific text chunk.

    Attributes:
        start_idx (int): The inclusive start character index.
        end_idx (int): The exclusive end character index.
    """

    start_idx: int
    end_idx: int


class Segment(BaseModel):
    """A bounded text string mapped to its specific location in the source.

    Attributes:
        text (str): The extracted string.
        span (TextSpan): The character offsets representing where the text appears.
    """

    text: str
    span: TextSpan


class ExtractedArgument(BaseModel):
    """A fully processed argument containing its core snippet, description, and context.

    Attributes:
        argument (Segment): The core verbatim argument and its span.
        description (str): The LLM-generated summary of the argument.
        context (Segment): The broader textual context bounding the argument.
    """

    argument: Segment
    description: str
    context: Segment


class ChunkArguments(BaseModel):
    """A grouping of all arguments extracted from a single document chunk.

    Attributes:
        chunk (ChunkEWMS): The source document chunk.
        arguments (list[ExtractedArgument]): The list of fully processed arguments found in this chunk.
    """

    chunk: ChunkEWMS
    arguments: list[ExtractedArgument]


class DocumentArguments(BaseModel):
    """A grouping of all chunks and their respective arguments for a single document.

    Attributes:
        document_id (str): The unique identifier of the parent document.
        chunk_arguments (list[ChunkArguments]): The hierarchical list of chunk-level extractions.
    """

    document_id: str
    chunk_arguments: list[ChunkArguments]


class ArgumentExtractionOutput(BaseModel):
    """Final output payload of the argument extraction workflow.

    Attributes:
        document_arguments (list[DocumentArguments]): The complete structured hierarchy of all extractions.
    """

    document_arguments: list[DocumentArguments]


# ---------------------------------------------------------------------------
# Argument Classification Types
# ---------------------------------------------------------------------------


class ArgumentRecord(BaseModel):
    """A wrapper for an extracted argument that includes its persisted argument ID.

    Attributes:
        argument_id (UUID): The persisted identifier for this specific extracted argument.
        extracted_argument (ExtractedArgument): The underlying extracted argument data.
    """

    argument_id: UUID
    extracted_argument: ExtractedArgument


class TopicBase(BaseModel):
    """Base model for shared topic attributes to avoid schema repetition.

    Attributes:
        topic_id (UUID): The persisted PLS topic ID.
        name (str): The display name.
        description (str): Detailed criteria defining the topic/subtopic.
    """

    topic_id: UUID
    name: str
    description: str


class ArgumentSubtopic(TopicBase):
    """Represents a specific subtopic within a broader thematic topic."""

    pass


class ArgumentTopic(TopicBase):
    """Represents a thematic topic for classifying arguments.

    Attributes:
        subtopics (list[ArgumentSubtopic]): The subtopics belonging to this topic.
    """

    subtopics: list[ArgumentSubtopic]


class ArgumentClassificationParams(BaseModel):
    """Input parameters for the argument classification workflow.

    Attributes:
        argument_records (list[ArgumentRecord]): The list of tracked arguments
            that need to be classified.
        topics (list[ArgumentTopic]): The master list of available
            thematic topics, including their nested subtopics.
    """

    argument_records: list[ArgumentRecord]
    topics: list[ArgumentTopic]


class ClassifiedArgument(BaseModel):
    """An enriched argument object containing its assigned topic, subtopic, and metadata.

    Attributes:
        argument_record (ArgumentRecord): The tracked argument data including its ID.
        topic (ArgumentTopic | None): The main thematic topic assigned to this argument,
            or None if no suitable topic was found.
        subtopic (ArgumentSubtopic | None): The granular subtopic assigned to this argument,
            or None if no suitable subtopic was found or if the argument was only classified
            at the main topic level.
        reasoning (str): The justification for selecting the topic/subtopic, or the explanation
            for why it remained unclassified or lacked granular details.
        confidence (float): The final confidence score for the classification decision.
    """

    argument_record: ArgumentRecord
    topic: ArgumentTopic | None
    subtopic: ArgumentSubtopic | None
    reasoning: str
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
    )


class ArgumentClassificationOutput(BaseModel):
    """The final structured output of the classification process.

    Attributes:
        classified_arguments (list[ClassifiedArgument]): The complete list of processed
            arguments, incorporating both successfully mapped topics and explicitly
            null topics for unclassified items.
    """

    classified_arguments: list[ClassifiedArgument]
