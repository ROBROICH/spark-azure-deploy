from authentification.enums import Relation
from pydantic import Field

from src.models.schemas.shared import SnakeCaseModel, accepts_camel


class RelationshipWriteResponse(SnakeCaseModel):
    """Response model for relationship mutations."""

    success: bool = True


class ProjectAssignmentItem(SnakeCaseModel):
    """Single project assignment relation."""

    role: Relation
    user_id: str = accepts_camel("user_id")


class ProjectAssignmentsRequest(SnakeCaseModel):
    """Complete owner/member assignment set for one project."""

    assignments: list[ProjectAssignmentItem] = Field(
        ...,
        description="Complete set of project assignments to persist.",
    )
