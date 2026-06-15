"""Tests for llm_client._shared — singleton client and constants."""

from __future__ import annotations

from unittest.mock import patch

import llm_client._shared as shared


class TestConstants:
    def test_non_retryable_status_codes(self) -> None:
        assert frozenset({404, 422}) == shared.NON_RETRYABLE_STATUS_CODES

    def test_auth_error_status_codes(self) -> None:
        assert frozenset({401, 403}) == shared.AUTH_ERROR_STATUS_CODES


class TestGetClient:
    def setup_method(self) -> None:
        shared._client = None

    def teardown_method(self) -> None:
        shared._client = None

    def test_creates_client_once(self) -> None:
        client1 = shared.get_client()
        client2 = shared.get_client()
        assert client1 is client2

    def test_client_has_correct_base_url(self) -> None:
        from llm_client.env import ENV

        client = shared.get_client()
        assert str(client.base_url).rstrip("/") == ENV.LITELLM.BASE_URL.rstrip("/")

    def test_client_has_correct_api_key(self) -> None:
        from llm_client.env import ENV

        client = shared.get_client()
        assert client.api_key == ENV.LITELLM.MASTER_KEY

    def test_client_max_retries_zero(self) -> None:
        client = shared.get_client()
        assert client.max_retries == 0

    def test_client_timeout(self) -> None:
        client = shared.get_client()
        assert client.timeout == 1200.0

    @patch("llm_client._shared.AsyncOpenAI")
    def test_creates_new_client_when_none(self, mock_openai_cls) -> None:  # type: ignore[no-untyped-def]
        mock_openai_cls.return_value = "mock_client"
        result = shared.get_client()
        assert result == "mock_client"
        mock_openai_cls.assert_called_once()
