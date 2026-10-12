import io
import json

from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogLevel,
    ServiceComponent,
)
from event_logging.event_logger import EventLogger


def test_event_logger_initialization():
    stream = io.StringIO()
    logger = EventLogger(service_name="test-service", stream=stream)
    assert logger.service_name == "test-service"
    assert logger.stream == stream


def test_log_event_output():
    stream = io.StringIO()
    logger = EventLogger(service_name="test-service", stream=stream)

    logger.log_event(
        level=LogLevel.INFO,
        action=EventAction.ACCESS,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.API,
        message="Test message",
        user_id="user-123",
    )

    output = stream.getvalue()
    log_entry = json.loads(output)

    assert log_entry["service.name"] == "test-service"
    assert log_entry["log.level"] == "info"
    assert log_entry["event.action"] == "access"
    assert log_entry["event.outcome"] == "success"
    assert log_entry["event.category"] == "api"
    assert log_entry["message"] == "Test message"
    assert log_entry["user.id"] == "user-123"
    assert "@timestamp" in log_entry


def test_convenience_methods():
    stream = io.StringIO()
    logger = EventLogger(service_name="test-service", stream=stream)

    logger.info(
        action=EventAction.READ, outcome=EventOutcome.SUCCESS, category=EventCategory.DATABASE, message="Info message"
    )

    output = stream.getvalue().strip()
    log_entry = json.loads(output)
    assert log_entry["log.level"] == "info"
    assert log_entry["message"] == "Info message"

    stream = io.StringIO()
    logger.stream = stream
    logger.error(
        action=EventAction.WRITE, outcome=EventOutcome.FAILURE, category=EventCategory.DATABASE, message="Error message"
    )
    output = stream.getvalue().strip()
    log_entry = json.loads(output)
    assert log_entry["log.level"] == "error"
    assert log_entry["message"] == "Error message"


def test_default_context():
    stream = io.StringIO()
    logger = EventLogger(service_name="test-service", stream=stream, default_context={"environment": "test"})

    logger.info(action=EventAction.ACCESS, outcome=EventOutcome.SUCCESS, category=EventCategory.API)

    output = stream.getvalue()
    log_entry = json.loads(output)
    assert log_entry["environment"] == "test"


def test_service_component_override():
    stream = io.StringIO()
    logger = EventLogger(service_name="test-service", service_component=ServiceComponent.API_GATEWAY, stream=stream)

    # Default component
    logger.info(action=EventAction.ACCESS, outcome=EventOutcome.SUCCESS, category=EventCategory.API)
    log_entry = json.loads(stream.getvalue().strip().split("\n")[0])
    assert log_entry["service.component"] == "api_gateway"

    # Override component
    logger.info(
        action=EventAction.ACCESS,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.API,
        service_component=ServiceComponent.AUTHENTICATION,
    )
    log_entry = json.loads(stream.getvalue().strip().split("\n")[1])
    assert log_entry["service.component"] == "authentication"
