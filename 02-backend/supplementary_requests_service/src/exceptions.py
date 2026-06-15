"""
Exception registry for the supplementary requests service.

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
from sqlalchemy.exc import SQLAlchemyError


class ResourceNotFoundError(Exception):
    """Base exception for resource not found errors."""

    def __init__(self, resource_type: str, resource_id: str) -> None:
        self.resource_type = resource_type
        self.resource_id = resource_id
        super().__init__(f"{resource_type} {resource_id} not found")


class SupplementaryRequestNotFoundError(ResourceNotFoundError):
    """Raised when a supplementary request is not found or doesn't belong to project."""

    def __init__(self, request_id: str) -> None:
        super().__init__("SupplementaryRequest", request_id)


class ProjectNotFoundError(ResourceNotFoundError):
    """Raised when a project is not found."""

    def __init__(self, project_id: str) -> None:
        super().__init__("Project", project_id)


class DuplicateSourceBindingError(Exception):
    """Raised when a duplicate source binding is detected (409 Conflict)."""

    def __init__(self, project_id: str, source_type: str, source_item_id: str) -> None:
        self.project_id = project_id
        self.source_type = source_type
        self.source_item_id = source_item_id
        super().__init__(f"Source binding ({source_type}, {source_item_id}) already exists for project {project_id}")


class InvalidSortParameterError(Exception):
    """Raised when sort query parameter has an unsupported format or value."""

    def __init__(self, sort_value: str) -> None:
        self.sort_value = sort_value
        super().__init__(f"Invalid sort parameter: {sort_value}")


# Export all exception types for easy importing
__all__ = [
    "DuplicateSourceBindingError",
    "FastAPIError",
    "ForeignKeyViolationError",
    "InvalidSortParameterError",
    "PostgresError",
    "ProjectNotFoundError",
    "RequestValidationError",
    "ResourceNotFoundError",
    "SQLAlchemyError",
    "SupplementaryRequestNotFoundError",
]
