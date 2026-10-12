"""Tests for DoclingApiClient async submit/poll/fetch with sync fallback."""

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from src.providers.docling.api_client import MAX_NETWORK_ERRORS, DoclingApiClient, DoclingTaskLostError

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _json_response(data: dict[str, Any], status_code: int = 200) -> httpx.Response:
    """Build a fake httpx.Response with JSON body."""
    return httpx.Response(
        status_code=status_code,
        json=data,
        request=httpx.Request("GET", "http://test"),
    )


def _make_client(timeout: int = 1800) -> DoclingApiClient:
    """Create a DoclingApiClient with default test settings."""
    return DoclingApiClient(base_url="http://docling:5001", timeout=timeout)


def _mock_httpx_client(**overrides: Any) -> AsyncMock:
    """Create a mock httpx.AsyncClient with context manager support."""
    client = AsyncMock(spec=httpx.AsyncClient)
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    for attr, value in overrides.items():
        setattr(client, attr, value)
    return client


SUBMIT_RESPONSE = {"task_id": "abc-123", "task_status": "pending"}
POLL_PENDING = {"task_id": "abc-123", "task_status": "pending"}
POLL_STARTED = {"task_id": "abc-123", "task_status": "started"}
POLL_SUCCESS = {"task_id": "abc-123", "task_status": "success"}
POLL_FAILED = {"task_id": "abc-123", "task_status": "failure"}
RESULT_OK = {
    "status": "success",
    "document": {"json_content": {"texts": list[dict[str, Any]]()}, "md_content": "# Hello"},
}


# ---------------------------------------------------------------------------
# Tests — async path
# ---------------------------------------------------------------------------


@patch("src.providers.docling.api_client.asyncio.sleep", new_callable=AsyncMock)
@patch("src.providers.docling.api_client.get_keycloak_token_provider", return_value=None)
@patch("src.providers.docling.api_client.get_config")
class TestAsyncPath:
    """Tests for the async submit/poll/fetch flow."""

    async def test_happy_path(self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any) -> None:
        """Submit → poll started → poll success → fetch result."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = _make_client()

        mock_client = _mock_httpx_client(
            post=AsyncMock(return_value=_json_response(SUBMIT_RESPONSE)),
            get=AsyncMock(
                side_effect=[
                    _json_response(POLL_STARTED),
                    _json_response(POLL_SUCCESS),
                    _json_response(RESULT_OK),
                ]
            ),
        )

        with patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client):
            result = await api.convert_document(b"pdf-bytes", "test.pdf")

        assert result["status"] == "success"
        assert result["document"]["md_content"] == "# Hello"
        assert "/v1/convert/file/async" in mock_client.post.call_args[0][0]
        # 2 polls + 1 fetch = 3 GET calls
        assert mock_client.get.call_count == 3

    async def test_heartbeat_called_each_poll(self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any) -> None:
        """Heartbeat function is called once per poll iteration."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = _make_client()
        heartbeat = MagicMock()

        mock_client = _mock_httpx_client(
            post=AsyncMock(return_value=_json_response(SUBMIT_RESPONSE)),
            get=AsyncMock(
                side_effect=[
                    _json_response(POLL_PENDING),
                    _json_response(POLL_STARTED),
                    _json_response(POLL_SUCCESS),
                    _json_response(RESULT_OK),
                ]
            ),
        )

        with patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client):
            await api.convert_document(b"pdf-bytes", "test.pdf", heartbeat_fn=heartbeat)

        # 1 submit heartbeat + 3 poll iterations (pending, started, success)
        assert heartbeat.call_count == 4

    async def test_failed_conversion(self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any) -> None:
        """Poll returns 'failure' → raises RuntimeError."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = _make_client()

        mock_client = _mock_httpx_client(
            post=AsyncMock(return_value=_json_response(SUBMIT_RESPONSE)),
            get=AsyncMock(side_effect=[_json_response(POLL_FAILED)]),
        )

        with patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(RuntimeError, match="async conversion failed"):
                await api.convert_document(b"pdf-bytes", "test.pdf")

    async def test_pod_restart_404(self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any) -> None:
        """Poll returns 404 → raises RuntimeError about pod restart."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = _make_client()

        mock_client = _mock_httpx_client(
            post=AsyncMock(return_value=_json_response(SUBMIT_RESPONSE)),
            get=AsyncMock(
                side_effect=[
                    _json_response(POLL_STARTED),
                    _json_response({"detail": "not found"}, status_code=404),
                ]
            ),
        )

        with patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(RuntimeError, match="task lost"):
                await api.convert_document(b"pdf-bytes", "test.pdf")

    async def test_queue_wait_does_not_consume_compute_budget(
        self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any
    ) -> None:
        """A pending task can wait longer than its compute budget and still complete."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = DoclingApiClient(base_url="http://docling:5001", timeout=10, queue_wait_timeout=100)
        clock = MagicMock()
        clock.monotonic.return_value = 0.0
        queue_ready_at = 40.0

        mock_client = _mock_httpx_client(
            post=AsyncMock(return_value=_json_response(SUBMIT_RESPONSE)),
        )

        async def get_response(url: str, **kwargs: Any) -> httpx.Response:
            if "/v1/result/" in url:
                return _json_response(RESULT_OK)
            now = clock.monotonic.return_value
            clock.monotonic.return_value += 20.0
            return _json_response(POLL_PENDING if now < queue_ready_at else POLL_SUCCESS)

        mock_client.get.side_effect = get_response
        with (
            patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client),
            patch("src.providers.docling.api_client.time", clock),
        ):
            result = await api.convert_document(b"pdf-bytes", "test.pdf")

        assert result["document"]["md_content"] == "# Hello"

    async def test_result_failure_status(self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any) -> None:
        """Result JSON with status='failure' raises RuntimeError."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = _make_client()
        failure_result = {"status": "failure", "errors": ["out of memory"]}

        mock_client = _mock_httpx_client(
            post=AsyncMock(return_value=_json_response(SUBMIT_RESPONSE)),
            get=AsyncMock(
                side_effect=[
                    _json_response(POLL_SUCCESS),
                    _json_response(failure_result),
                ]
            ),
        )

        with patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(RuntimeError, match="conversion failed.*out of memory"):
                await api.convert_document(b"pdf-bytes", "test.pdf")

    async def test_network_error_retried(self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any) -> None:
        """Network errors on poll are retried, conversion still succeeds."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = _make_client()
        log_messages = []

        mock_client = _mock_httpx_client(
            post=AsyncMock(return_value=_json_response(SUBMIT_RESPONSE)),
            get=AsyncMock(
                side_effect=[
                    _json_response(POLL_STARTED),
                    httpx.ReadTimeout("read timed out"),
                    httpx.ConnectError("connection reset"),
                    _json_response(POLL_SUCCESS),
                    _json_response(RESULT_OK),
                ]
            ),
        )

        with patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client):
            result = await api.convert_document(b"pdf-bytes", "test.pdf", log_fn=log_messages.append)

        assert result["status"] == "success"
        assert mock_client.get.call_count == 5
        assert any("Network error" in msg for msg in log_messages)

    async def test_network_errors_exhausted(self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any) -> None:
        """Too many consecutive network errors raises RuntimeError."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = _make_client()

        mock_client = _mock_httpx_client(
            post=AsyncMock(return_value=_json_response(SUBMIT_RESPONSE)),
            get=AsyncMock(side_effect=[httpx.ReadTimeout("read timed out")] * MAX_NETWORK_ERRORS),
        )

        with patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(RuntimeError, match="consecutive network errors"):
                await api.convert_document(b"pdf-bytes", "test.pdf")

    async def test_503_retried_until_success(self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any) -> None:
        """503s on poll are retried indefinitely (deadline is the limit), conversion succeeds."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = _make_client()
        log_messages = []

        # 50 consecutive 503s followed by success — no error limit
        mock_client = _mock_httpx_client(
            post=AsyncMock(return_value=_json_response(SUBMIT_RESPONSE)),
            get=AsyncMock(
                side_effect=[
                    *[_json_response({"error": "overloaded"}, status_code=503)] * 50,
                    _json_response(POLL_SUCCESS),
                    _json_response(RESULT_OK),
                ]
            ),
        )

        with patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client):
            result = await api.convert_document(b"pdf-bytes", "test.pdf", log_fn=log_messages.append)

        assert result["status"] == "success"
        # 50 x 503 + 1 success poll + 1 fetch = 52 GET calls
        assert mock_client.get.call_count == 52
        assert any("docling-serve busy" in msg for msg in log_messages)

    async def test_submit_missing_task_id(self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any) -> None:
        """Submit returns 200 but response has no task_id → raises RuntimeError."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = _make_client()

        mock_client = _mock_httpx_client(
            post=AsyncMock(return_value=_json_response({"status": "ok"})),
        )

        with patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(RuntimeError, match="did not return a task_id"):
                await api.convert_document(b"pdf-bytes", "test.pdf")

    async def test_poll_non_dict_response(self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any) -> None:
        """Poll returns non-dict JSON → raises RuntimeError."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = _make_client()

        # Submit succeeds, poll returns a JSON array instead of dict
        poll_response = httpx.Response(
            status_code=200,
            json=["not", "a", "dict"],
            request=httpx.Request("GET", "http://test"),
        )

        mock_client = _mock_httpx_client(
            post=AsyncMock(return_value=_json_response(SUBMIT_RESPONSE)),
            get=AsyncMock(return_value=poll_response),
        )

        with patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(RuntimeError, match="non-dict poll response"):
                await api.convert_document(b"pdf-bytes", "test.pdf")

    async def test_log_fn_receives_status_messages(self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any) -> None:
        """log_fn callback receives task status messages."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = _make_client()
        log_messages = []

        mock_client = _mock_httpx_client(
            post=AsyncMock(return_value=_json_response(SUBMIT_RESPONSE)),
            get=AsyncMock(
                side_effect=[
                    _json_response(POLL_SUCCESS),
                    _json_response(RESULT_OK),
                ]
            ),
        )

        with patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client):
            await api.convert_document(b"pdf-bytes", "test.pdf", log_fn=log_messages.append)

        assert any("abc-123" in msg for msg in log_messages)
        assert any("success" in msg for msg in log_messages)


# ---------------------------------------------------------------------------
# Tests — sync fallback
# ---------------------------------------------------------------------------


@patch("src.providers.docling.api_client.asyncio.sleep", new_callable=AsyncMock)
@patch("src.providers.docling.api_client.get_keycloak_token_provider", return_value=None)
@patch("src.providers.docling.api_client.get_config")
class TestSyncFallback:
    """Tests for fallback to sync endpoint when async is unavailable."""

    async def test_fallback_on_404(self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any) -> None:
        """Async submit returns 404 → falls back to sync and succeeds."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = _make_client()

        # First client (async attempt): POST returns 404
        async_client = _mock_httpx_client(
            post=AsyncMock(
                side_effect=httpx.HTTPStatusError(
                    "404",
                    request=httpx.Request("POST", "http://test/v1/convert/file/async"),
                    response=httpx.Response(404),
                )
            ),
        )

        # Second client (sync fallback): POST returns result
        sync_client = _mock_httpx_client(
            post=AsyncMock(return_value=_json_response(RESULT_OK)),
        )

        clients = iter([async_client, sync_client])

        with patch(
            "src.providers.docling.api_client.httpx.AsyncClient",
            side_effect=lambda **kw: next(clients),
        ):
            result = await api.convert_document(b"pdf-bytes", "test.pdf")

        assert result["status"] == "success"
        # Verify sync endpoint was called
        sync_call_url = sync_client.post.call_args[0][0]
        assert "/v1/convert/file" in sync_call_url
        assert "/async" not in sync_call_url

    async def test_fallback_on_405(self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any) -> None:
        """Async submit returns 405 → falls back to sync."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = _make_client()

        async_client = _mock_httpx_client(
            post=AsyncMock(
                side_effect=httpx.HTTPStatusError(
                    "405",
                    request=httpx.Request("POST", "http://test/v1/convert/file/async"),
                    response=httpx.Response(405),
                )
            ),
        )

        sync_client = _mock_httpx_client(
            post=AsyncMock(return_value=_json_response(RESULT_OK)),
        )

        clients = iter([async_client, sync_client])

        with patch(
            "src.providers.docling.api_client.httpx.AsyncClient",
            side_effect=lambda **kw: next(clients),
        ):
            result = await api.convert_document(b"pdf-bytes", "test.pdf")

        assert result["status"] == "success"

    async def test_non_404_error_not_caught(self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any) -> None:
        """Async submit returns 500 → wrapped in RuntimeError (no fallback)."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = _make_client()

        mock_client = _mock_httpx_client(
            post=AsyncMock(
                side_effect=httpx.HTTPStatusError(
                    "500",
                    request=httpx.Request("POST", "http://test"),
                    response=httpx.Response(500),
                )
            ),
        )

        with patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(RuntimeError, match="submit failed.*HTTP 500"):
                await api.convert_document(b"pdf-bytes", "test.pdf")

    async def test_sync_failure_status(self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any) -> None:
        """Sync fallback with failure result raises RuntimeError."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = _make_client()
        failure_result = {"status": "failure", "errors": ["corrupt PDF"]}

        async_client = _mock_httpx_client(
            post=AsyncMock(
                side_effect=httpx.HTTPStatusError(
                    "404",
                    request=httpx.Request("POST", "http://test/v1/convert/file/async"),
                    response=httpx.Response(404),
                )
            ),
        )

        sync_client = _mock_httpx_client(
            post=AsyncMock(return_value=_json_response(failure_result)),
        )

        clients = iter([async_client, sync_client])

        with patch(
            "src.providers.docling.api_client.httpx.AsyncClient",
            side_effect=lambda **kw: next(clients),
        ):
            with pytest.raises(RuntimeError, match="conversion failed.*corrupt PDF"):
                await api.convert_document(b"pdf-bytes", "test.pdf")


# ---------------------------------------------------------------------------
# Tests — submit_document
# ---------------------------------------------------------------------------


@patch("src.providers.docling.api_client.asyncio.sleep", new_callable=AsyncMock)
@patch("src.providers.docling.api_client.get_keycloak_token_provider", return_value=None)
@patch("src.providers.docling.api_client.get_config")
class TestSubmitDocument:
    """Tests for the standalone submit_document method."""

    async def test_submit_returns_task_id(self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any) -> None:
        """Happy path: submit returns a task_id."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = _make_client()

        mock_client = _mock_httpx_client(
            post=AsyncMock(return_value=_json_response(SUBMIT_RESPONSE)),
        )

        with patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client):
            task_id = await api.submit_document(b"pdf-bytes", "test.pdf")

        assert task_id == "abc-123"

    async def test_submit_raises_on_404(self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any) -> None:
        """Async endpoint unavailable (404) raises RuntimeError for retry."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = _make_client()

        mock_client = _mock_httpx_client(
            post=AsyncMock(
                side_effect=httpx.HTTPStatusError(
                    "404",
                    request=httpx.Request("POST", "http://test"),
                    response=httpx.Response(404),
                )
            ),
        )

        with patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(RuntimeError, match="async endpoint unavailable"):
                await api.submit_document(b"pdf-bytes", "test.pdf")

    async def test_submit_raises_on_500(self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any) -> None:
        """Non-retryable HTTP error raises RuntimeError."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = _make_client()

        mock_client = _mock_httpx_client(
            post=AsyncMock(
                side_effect=httpx.HTTPStatusError(
                    "500",
                    request=httpx.Request("POST", "http://test"),
                    response=httpx.Response(500),
                )
            ),
        )

        with patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(RuntimeError, match="submit failed.*HTTP 500"):
                await api.submit_document(b"pdf-bytes", "test.pdf")


# ---------------------------------------------------------------------------
# Tests — poll_and_fetch_result
# ---------------------------------------------------------------------------


@patch("src.providers.docling.api_client.asyncio.sleep", new_callable=AsyncMock)
@patch("src.providers.docling.api_client.get_keycloak_token_provider", return_value=None)
@patch("src.providers.docling.api_client.get_config")
class TestPollAndFetchResult:
    """Tests for the standalone poll_and_fetch_result method."""

    async def test_happy_path(self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any) -> None:
        """Poll success then fetch result."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = _make_client()

        mock_client = _mock_httpx_client(
            get=AsyncMock(
                side_effect=[
                    _json_response(POLL_STARTED),
                    _json_response(POLL_SUCCESS),
                    _json_response(RESULT_OK),
                ]
            ),
        )

        with patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client):
            result = await api.poll_and_fetch_result("abc-123")

        assert result["status"] == "success"
        assert "document" in result

    async def test_task_lost_raises_docling_task_lost_error(
        self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any
    ) -> None:
        """404 on poll raises DoclingTaskLostError."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = _make_client()

        mock_client = _mock_httpx_client(
            get=AsyncMock(
                side_effect=[
                    _json_response(POLL_STARTED),
                    _json_response({}, status_code=404),
                ]
            ),
        )

        with patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(DoclingTaskLostError) as exc_info:
                await api.poll_and_fetch_result("abc-123")

        assert exc_info.value.task_id == "abc-123"
        # DoclingTaskLostError is a RuntimeError subclass
        assert isinstance(exc_info.value, RuntimeError)

    @pytest.mark.parametrize("started", [False, True])
    async def test_phase_budget_expires(
        self, mock_config: Any, _mock_kc: Any, _mock_sleep: Any, started: bool
    ) -> None:
        """Pending tasks exhaust queue time; repeated started replies cannot renew compute time."""
        mock_config.return_value = MagicMock(DOCLING_OCR_ENGINE="easyocr", DOCLING_OCR_LANG="de")
        api = DoclingApiClient(base_url="http://docling:5001", timeout=10, queue_wait_timeout=30)
        clock = MagicMock()
        clock.monotonic.return_value = 0.0

        async def poll(*args: Any, **kwargs: Any) -> httpx.Response:
            clock.monotonic.return_value += 5.0
            return _json_response(
                {"task_status": "started" if started else "pending", "task_position": 4}
            )

        mock_client = _mock_httpx_client(get=AsyncMock(side_effect=poll))
        with (
            patch("src.providers.docling.api_client.httpx.AsyncClient", return_value=mock_client),
            patch("src.providers.docling.api_client.time", clock),
            pytest.raises(RuntimeError, match="conversion timed out" if started else "queue position 4"),
        ):
            await api.poll_and_fetch_result("abc-123")
