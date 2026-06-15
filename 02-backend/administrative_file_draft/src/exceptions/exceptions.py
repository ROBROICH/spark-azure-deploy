class NotFoundError(Exception):
    """Custom exception for not found errors."""

    def __init__(self, message: str = "Resource not found") -> None:
        """Initialize the exception with a message."""
        super().__init__(message)
