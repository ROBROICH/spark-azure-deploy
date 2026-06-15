"""Unit tests for logger utility module."""

import io
import json

from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)

from src.config.settings import settings
from src.utils.logger import logger


class TestLogger:
    """Test suite for the logger utility."""

    def test_logger_initialization(self):
        """Test that logger is initialized with correct service name."""
        assert logger.service_name == settings.SERVICE_NAME
        assert logger.service_name == "supplementary-requests-service"

    def test_logger_error_method(self):
        """Test the error logging method as used in exception handlers."""
        stream = io.StringIO()
        test_logger = logger.model_copy(update={"stream": stream})

        test_logger.error(
            action=EventAction.ACCESS,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            default_event=LogEventDefault.GENERAL,
            message="Test error message on /test/path: Test exception",
            error_message="Test exception",
        )

        output = stream.getvalue().strip()
        log_entry = json.loads(output)

        # Verify basic structure
        assert log_entry["service.name"] == "supplementary-requests-service"
        assert log_entry["log.level"] == "error"
        assert log_entry["event.action"] == "access"
        assert log_entry["event.outcome"] == "failure"
        assert log_entry["event.category"] == "api"
        assert log_entry["event.default"] == "general"
        assert log_entry["message"] == "Test error message on /test/path: Test exception"
        assert log_entry["error.message"] == "Test exception"
        assert "@timestamp" in log_entry
        assert "ecs.version" in log_entry

    def test_logger_info_method(self):
        """Test the info logging method."""
        stream = io.StringIO()
        test_logger = logger.model_copy(update={"stream": stream})

        test_logger.info(
            action=EventAction.READ,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.API,
            default_event=LogEventDefault.GENERAL,
            message="Test info message",
        )

        output = stream.getvalue().strip()
        log_entry = json.loads(output)

        assert log_entry["log.level"] == "info"
        assert log_entry["event.action"] == "read"
        assert log_entry["event.outcome"] == "success"
        assert log_entry["message"] == "Test info message"

    def test_logger_warn_method(self):
        """Test the warn logging method."""
        stream = io.StringIO()
        test_logger = logger.model_copy(update={"stream": stream})

        test_logger.warn(
            action=EventAction.VALIDATE,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            default_event=LogEventDefault.VALIDATION_FAILURE,
            message="Test warning message",
        )

        output = stream.getvalue().strip()
        log_entry = json.loads(output)

        assert log_entry["log.level"] == "warn"
        assert log_entry["event.action"] == "validate"
        assert log_entry["event.outcome"] == "failure"
        assert log_entry["event.default"] == "validation_failure"
        assert log_entry["message"] == "Test warning message"

    def test_logger_debug_method(self):
        """Test the debug logging method."""
        stream = io.StringIO()
        test_logger = logger.model_copy(update={"stream": stream})

        test_logger.debug(
            action=EventAction.ACCESS,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.API,
            message="Test debug message",
        )

        output = stream.getvalue().strip()
        log_entry = json.loads(output)

        assert log_entry["log.level"] == "debug"
        assert log_entry["message"] == "Test debug message"

    def test_logger_fatal_method(self):
        """Test the fatal logging method."""
        stream = io.StringIO()
        test_logger = logger.model_copy(update={"stream": stream})

        test_logger.fatal(
            action=EventAction.ACCESS,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            default_event=LogEventDefault.GENERAL,
            message="Test fatal message",
        )

        output = stream.getvalue().strip()
        log_entry = json.loads(output)

        assert log_entry["log.level"] == "fatal"
        assert log_entry["message"] == "Test fatal message"

    def test_logger_with_different_event_types(self):
        """Test logger with different event types used in exception handlers."""
        stream = io.StringIO()
        test_logger = logger.model_copy(update={"stream": stream})

        # Test RESOURCE_NOT_FOUND event
        test_logger.error(
            action=EventAction.READ,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            default_event=LogEventDefault.RESOURCE_NOT_FOUND,
            message="Resource not found",
        )

        output = stream.getvalue().strip()
        log_entry = json.loads(output)

        assert log_entry["event.default"] == "resource_not_found"
        assert log_entry["event.action"] == "read"

    def test_logger_with_database_category(self):
        """Test logger with database category as used in exception handlers."""
        stream = io.StringIO()
        test_logger = logger.model_copy(update={"stream": stream})

        test_logger.error(
            action=EventAction.WRITE,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.DATABASE,
            default_event=LogEventDefault.DB_ERROR,
            message="Database error occurred",
            error_message="Foreign key violation",
        )

        output = stream.getvalue().strip()
        log_entry = json.loads(output)

        assert log_entry["event.category"] == "database"
        assert log_entry["event.default"] == "db_error"
        assert log_entry["error.message"] == "Foreign key violation"

    def test_logger_json_output_validity(self):
        """Test that logger outputs valid JSON."""
        stream = io.StringIO()
        test_logger = logger.model_copy(update={"stream": stream})

        test_logger.info(
            action=EventAction.ACCESS,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.API,
            message="Valid JSON test",
        )

        output = stream.getvalue().strip()
        # Should not raise an exception
        log_entry = json.loads(output)
        assert isinstance(log_entry, dict)

    def test_logger_multiple_entries(self):
        """Test that logger can handle multiple log entries."""
        stream = io.StringIO()
        test_logger = logger.model_copy(update={"stream": stream})

        test_logger.info(
            action=EventAction.READ,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.API,
            message="First message",
        )

        test_logger.error(
            action=EventAction.WRITE,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            message="Second message",
        )

        output = stream.getvalue().strip()
        lines = output.split("\n")

        assert len(lines) == 2

        first_entry = json.loads(lines[0])
        second_entry = json.loads(lines[1])

        assert first_entry["message"] == "First message"
        assert first_entry["log.level"] == "info"
        assert second_entry["message"] == "Second message"
        assert second_entry["log.level"] == "error"

    def test_logger_with_additional_context(self):
        """Test logger with additional context fields like error_message."""
        stream = io.StringIO()
        test_logger = logger.model_copy(update={"stream": stream})

        test_logger.error(
            action=EventAction.ACCESS,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            default_event=LogEventDefault.GENERAL,
            message="Error with context",
            error_message="Detailed error information",
            user_id="test-user-123",
        )

        output = stream.getvalue().strip()
        log_entry = json.loads(output)

        assert log_entry["error.message"] == "Detailed error information"
        assert log_entry["user.id"] == "test-user-123"
