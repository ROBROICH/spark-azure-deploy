from event_logging import EventLogger

from authentification.config import auth_settings

_logger: EventLogger | None = None


def get_logger() -> EventLogger:
    global _logger  # noqa: PLW0603
    if not _logger:
        settings = auth_settings()
        _logger = EventLogger(service_name=settings.service_name)
    return _logger
