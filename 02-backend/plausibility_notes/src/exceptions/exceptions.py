"""Common exceptions for the microservice."""


class NotFoundError(Exception):
    """Raised when a requested entity cannot be found."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message
