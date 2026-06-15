"""
Exception registry for the objections management service.

Domain exceptions used in the application. Handlers are registered in
src.config.handlers (EXCEPTION_MAP).
"""


class ExternalServiceError(Exception):
    """Raised when a required downstream service call fails."""

    def __init__(self, service_name: str, message: str) -> None:
        self.service_name = service_name
        self.message = message
        super().__init__(f"{service_name}: {message}")
