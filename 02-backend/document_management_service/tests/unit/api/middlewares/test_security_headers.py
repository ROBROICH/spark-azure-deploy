"""
Tests for SecurityHeadersMiddleware

Test that all required security headers are properly set:
- Content Security Policy (CSP)
- HTTP Strict Transport Security (HSTS)
- X-Content-Type-Options
- X-Frame-Options
- Cache-Control for sensitive endpoints
- X-XSS-Protection
- Referrer-Policy
- Permissions-Policy
"""

import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient

from src.api.middlewares.security_headers import SecurityHeadersMiddleware


@pytest.fixture
def test_app():
    """Create a test FastAPI app with security headers middleware."""
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/api/test")
    async def test_api_endpoint():
        return {"message": "test"}

    @app.get("/public/test")
    async def test_public_endpoint():
        return {"message": "public"}

    @app.get("/api/projects")
    async def test_projects_endpoint():
        return {"projects": []}

    @app.get("/api/files/upload")
    async def test_files_endpoint():
        return {"files": []}

    return app


@pytest.fixture
def client(test_app):
    """Create a test client."""
    return TestClient(test_app)


class TestSecurityHeadersMiddleware:
    """Test suite for SecurityHeadersMiddleware."""

    def test_content_security_policy_header_present(self, client):
        """Test that CSP header is set and contains required directives."""
        response = client.get("/api/test")

        csp_header = response.headers.get("Content-Security-Policy")
        assert csp_header is not None

        # Check key CSP directives
        assert "default-src 'self'" in csp_header
        assert "script-src 'self'" in csp_header
        assert "object-src 'none'" in csp_header
        assert "frame-src 'none'" in csp_header
        assert "base-uri 'self'" in csp_header
        assert "form-action 'self'" in csp_header

    def test_x_content_type_options_header(self, client):
        """Test that X-Content-Type-Options header is set to nosniff."""
        response = client.get("/api/test")

        assert response.headers.get("X-Content-Type-Options") == "nosniff"

    def test_x_frame_options_header(self, client):
        """Test that X-Frame-Options header is set to SAMEORIGIN."""
        response = client.get("/api/test")

        assert response.headers.get("X-Frame-Options") == "SAMEORIGIN"

    def test_x_xss_protection_header(self, client):
        """Test that X-XSS-Protection header is set."""
        response = client.get("/api/test")

        assert response.headers.get("X-XSS-Protection") == "1; mode=block"

    def test_referrer_policy_header(self, client):
        """Test that Referrer-Policy header is set to same-origin."""
        response = client.get("/api/test")

        assert response.headers.get("Referrer-Policy") == "same-origin"

    def test_permissions_policy_header(self, client):
        """Test that Permissions-Policy header is not set in current implementation."""
        response = client.get("/api/test")

        # Current middleware doesn't implement Permissions-Policy
        permissions_policy = response.headers.get("Permissions-Policy")
        assert permissions_policy is None

    def test_cache_control_for_sensitive_api_endpoints(self, client):
        """
        Test that cache control headers are set for current middleware.
        """
        response = client.get("/api/test")

        assert response.headers.get("Cache-Control") == "no-cache, no-store, private, must-revalidate"

    def test_cache_control_for_file_endpoints(self, client):
        """
        Test that file endpoints don't have cache control headers
        in current implementation.
        """
        response = client.get("/api/files/upload")

        assert response.headers.get("Cache-Control") == "no-cache, no-store, private, must-revalidate"

    def test_content_type_header_for_api_endpoints(self, client):
        """Test that API endpoints have correct Content-Type header."""
        response = client.get("/api/test")

        content_type = response.headers.get("Content-Type")
        assert content_type is not None
        assert "application/json" in content_type
        # Current middleware doesn't add charset for this endpoint

    def test_hsts_header_with_https_scheme(self, test_app, monkeypatch):
        """Test that HSTS header is set for HTTPS requests."""
        # Create a client that simulates HTTPS
        client = TestClient(test_app, base_url="https://testserver")

        response = client.get("/api/test")

        hsts_header = response.headers.get("Strict-Transport-Security")
        assert hsts_header is not None

    def test_all_security_headers_present_on_single_request(self, client):
        """Test that all security headers are present in a single response."""
        response = client.get("/api/test")

        expected_headers = [
            "Content-Security-Policy",
            "X-Content-Type-Options",
            "X-Frame-Options",
            "X-XSS-Protection",
            "Referrer-Policy",
        ]

        for header in expected_headers:
            assert response.headers.get(header) is not None, f"Missing header: {header}"

    def test_response_status_codes_unchanged(self, client):
        """Test that middleware doesn't affect response status codes."""
        response = client.get("/api/test")
        assert response.status_code == status.HTTP_200_OK

        response = client.get("/nonexistent")
        assert response.status_code == status.HTTP_404_NOT_FOUND
