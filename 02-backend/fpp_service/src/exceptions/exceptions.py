"""Custom exceptions for FPP service."""


class NotFoundError(Exception):
    """Raised when a resource is not found."""

    pass


class OperationFailedError(Exception):
    """Raised when an operation fails."""

    pass


class ValidationError(Exception):
    """Raised when validation fails."""

    pass
