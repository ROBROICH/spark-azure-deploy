"""Tests for config.py helper functions (get_docling_url)."""

from unittest.mock import MagicMock, patch


class TestDoclingUrl:
    """Tests for get_docling_url URL construction."""

    def test_builds_url_from_env(self) -> None:
        """Test that URL is built from protocol, host, and port env vars."""
        mock_env = MagicMock()
        mock_env.DOCLING_PROTOCOL = "https"
        mock_env.DOCLING_HOST = "docling.example.com"
        mock_env.DOCLING_PORT = 8080

        with patch("src.config.ENV", mock_env):
            from src.config import get_docling_url

            result = get_docling_url()

        assert result == "https://docling.example.com:8080"

    def test_default_http_protocol(self) -> None:
        """Test that http protocol produces the correct URL."""
        mock_env = MagicMock()
        mock_env.DOCLING_PROTOCOL = "http"
        mock_env.DOCLING_HOST = "localhost"
        mock_env.DOCLING_PORT = 5001

        with patch("src.config.ENV", mock_env):
            from src.config import get_docling_url

            result = get_docling_url()

        assert result == "http://localhost:5001"
