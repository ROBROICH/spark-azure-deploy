class NotFoundError(Exception):
    def __init__(self, message: str = "Resource not found") -> None:
        super().__init__(message)
        self.message = message
