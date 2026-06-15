"""Integration tests for logger usage in exception handlers."""

import io
import json
from unittest.mock import Mock

import pytest
from event_logging.enums import (
    EventAction,
    EventCategory,
    LogEventDefault,
)
from fastapi import Request

from src.config.handlers import handle_exception
from src.exceptions import (
    ForeignKeyViolationError,
    SupplementaryRequestNotFoundError,
)
from src.utils.logger import logger


class TestLoggerIntegration:
    """Test logger integration with exception handlers."""

    @pytest.mark.asyncio
    async def test_handle_exception_logs_error(self):
        """Test that handle_exception properly logs errors using the logger."""
        # Create a mock request
        mock_request = Mock(spec=Request)
        mock_request.url.path = "/api/supplementary-requests/123"

        # Create a test exception (takes request_id,
        # formats as "SupplementaryRequest {id} not found")
        exc = SupplementaryRequestNotFoundError("123")

        original_stream = logger.stream
        stream = io.StringIO()
        logger.stream = stream

        try:
            # Call the exception handler
            response = await handle_exception(
                request=mock_request,
                exc=exc,
                status_code=404,
                message="Supplementary request not found",
                action=EventAction.READ,
                category=EventCategory.API,
                default_event=LogEventDefault.RESOURCE_NOT_FOUND,
            )

            # Verify response
            assert response.status_code == 404
            response_body = json.loads(response.body.decode())
            assert response_body["detail"] == "Supplementary request not found"

            # Verify logging occurred
            output = stream.getvalue().strip()
            log_entry = json.loads(output)

            assert log_entry["log.level"] == "error"
            assert log_entry["event.action"] == "read"
            assert log_entry["event.outcome"] == "failure"
            assert log_entry["event.category"] == "api"
            assert log_entry["event.default"] == "resource_not_found"
            assert "Supplementary request not found" in log_entry["message"]
            assert "SupplementaryRequest 123 not found" in log_entry["error.message"]
            assert "/api/supplementary-requests/123" in log_entry["message"]

        finally:
            # Restore original stream
            logger.stream = original_stream

    @pytest.mark.asyncio
    async def test_handle_exception_with_defaults(self):
        """Test that handle_exception uses default values when not provided."""
        mock_request = Mock(spec=Request)
        mock_request.url.path = "/test/path"

        exc = Exception("Generic error")

        original_stream = logger.stream
        stream = io.StringIO()
        logger.stream = stream

        try:
            response = await handle_exception(
                request=mock_request,
                exc=exc,
                status_code=500,
                message="Internal Server Error",
            )

            assert response.status_code == 500

            output = stream.getvalue().strip()
            log_entry = json.loads(output)

            # Should use defaults: ACCESS, API, GENERAL
            assert log_entry["event.action"] == "access"
            assert log_entry["event.category"] == "api"
            assert log_entry["event.default"] == "general"
            assert log_entry["log.level"] == "error"

        finally:
            logger.stream = original_stream

    @pytest.mark.asyncio
    async def test_handle_exception_with_database_error(self):
        """Test exception handler with database category error."""
        mock_request = Mock(spec=Request)
        mock_request.url.path = "/api/projects/123"

        exc = ForeignKeyViolationError("Foreign key constraint violation")

        original_stream = logger.stream
        stream = io.StringIO()
        logger.stream = stream

        try:
            response = await handle_exception(
                request=mock_request,
                exc=exc,
                status_code=400,
                message="Foreign Key Violation Error",
                action=EventAction.WRITE,
                category=EventCategory.DATABASE,
                default_event=LogEventDefault.DB_ERROR,
            )

            assert response.status_code == 400

            output = stream.getvalue().strip()
            log_entry = json.loads(output)

            assert log_entry["event.category"] == "database"
            assert log_entry["event.action"] == "write"
            assert log_entry["event.default"] == "db_error"
            assert "Foreign key constraint violation" in log_entry["error.message"]

        finally:
            logger.stream = original_stream
