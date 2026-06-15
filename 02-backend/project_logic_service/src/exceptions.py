"""
Exception registry for the project logic service.

This module consolidates all exception types used in the application:
- Third-party exceptions (asyncpg, SQLAlchemy, FastAPI)
- Custom domain exceptions

This centralization makes it easier to:
- Maintain a single source of truth for all exceptions
- Import exceptions consistently across the codebase
- Register exception handlers in one place
"""

# Third-party exceptions
from asyncpg.exceptions import ForeignKeyViolationError, PostgresError
from fastapi.exceptions import FastAPIError, RequestValidationError
from sqlalchemy.exc import IntegrityError, SQLAlchemyError


class ResourceNotFoundError(Exception):
    """Base exception for resource not found errors."""

    def __init__(self, resource_type: str, resource_id: str):
        """Initialize resource not found error.

        Args:
            resource_type: Type of resource (e.g., "Project")
            resource_id: ID of the resource that was not found
        """
        self.resource_type = resource_type
        self.resource_id = resource_id
        super().__init__(f"{resource_type} {resource_id} not found")


class DeadlineNotFoundError(ResourceNotFoundError):
    """Raised when a deadline is not found or doesn't belong to the project."""

    def __init__(self, deadline_id: str):
        """Initialize deadline not found error.

        Args:
            deadline_id: ID of the deadline that was not found
        """
        super().__init__("Deadline", deadline_id)


class TopicNotFoundError(ResourceNotFoundError):
    """Raised when a topic is not found or doesn't belong to the project."""

    def __init__(self, topic_id: str):
        """Initialize topic not found error.

        Args:
            topic_id: ID of the deadline that was not found
        """
        super().__init__("Topic", topic_id)


class ProjectNotFoundError(ResourceNotFoundError):
    """Raised when a project is not found."""

    def __init__(self, project_id: str):
        """Initialize project not found error.

        Args:
            project_id: ID of the project that was not found
        """
        super().__init__("Project", project_id)


class ProcessStepNotFoundError(ResourceNotFoundError):
    """Raised when a process step is not found."""

    def __init__(self, process_step_id: str):
        """Initialize process step not found error.

        Args:
            process_step_id: ID of the process step that was not found
        """
        super().__init__("ProcessStep", process_step_id)


class ProjectTypeNotFoundError(ResourceNotFoundError):
    """Raised when a project type is not found."""

    def __init__(self, project_type_id: str):
        """Initialize project type not found error.

        Args:
            project_type_id: ID of the project type that was not found
        """
        super().__init__("ProjectType", project_type_id)


class DuplicateProjectTypeError(Exception):
    """Raised when a project type name already exists."""

    def __init__(self, name: str = ""):
        """Initialize duplicate project type error.

        Args:
            name: The duplicate project type name
        """
        self.name = name
        msg = f"ProjectType with name '{name}' already exists" if name else "Duplicate project type name"
        super().__init__(msg)


class DuplicateProjectError(Exception):
    """Raised when a project with a duplicate internal name already exists."""

    def __init__(self, name: str = ""):
        """Initialize duplicate project type error.

        Args:
            name: The duplicate project type name
        """
        self.name = name
        msg = (
            f"Project with internal project number '{name}' already exists"
            if name
            else "Duplicate internal project number"
        )
        super().__init__(msg)


class InvalidStatusError(Exception):
    """Raised when an invalid project status is provided."""

    def __init__(self, status_name: str):
        """Initialize invalid status error.

        Args:
            status_name: Name of the invalid status
        """
        self.status_name = status_name
        super().__init__(f"Project status {status_name} not found")


class InvalidStatusTransitionError(Exception):
    """Raised when a status transition is not allowed (e.g., going backwards in flow)."""

    def __init__(self, from_status: str, to_status: str):
        """Initialize invalid status transition error.

        Args:
            from_status: The current status internal_name
            to_status: The target status internal_name
        """
        self.from_status = from_status
        self.to_status = to_status
        super().__init__(f"Cannot transition from {from_status} to {to_status}: only forward transitions are allowed")


class InvalidTopicForProjectTypeError(Exception):
    """Exception raised when an invalid topic for project type is provided."""


class TopicAlreadyAssignedError(Exception):
    """Exception raised when a topic is already assigned."""


class TopicNotAssignedError(Exception):
    """Exception raised when a topic is not assigned to a project."""


class TopicAlreadyExistsError(Exception):
    """Exception raised when a topic already exists."""


# Export all exception types for easy importing
__all__ = [
    "DeadlineNotFoundError",
    "DuplicateProjectTypeError",
    "FastAPIError",
    # Third-party exceptions
    "ForeignKeyViolationError",
    "IntegrityError",
    "InvalidStatusError",
    "InvalidStatusTransitionError",
    "InvalidTopicForProjectTypeError",
    "PostgresError",
    "ProcessStepNotFoundError",
    "ProjectNotFoundError",
    "ProjectTypeNotFoundError",
    "RequestValidationError",
    # Custom domain exceptions
    "ResourceNotFoundError",
    "SQLAlchemyError",
    "TopicAlreadyAssignedError",
    "TopicAlreadyExistsError",
    "TopicNotAssignedError",
    "TopicNotFoundError",
]
