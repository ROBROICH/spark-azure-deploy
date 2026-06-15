"""
Tests for HTTP method restrictions middleware.
"""

import pytest
from starlette import status


async def test_blocked_methods_return_405(client):
    """Test that TRACE, and PUT methods return 405 Method Not Allowed."""
    blocked_methods = ["TRACE", "PUT"]

    for method in blocked_methods:
        with pytest.raises(Exception) as exc_info:
            await client.request(method, "/projects")

        assert "405: HTTP method" in str(exc_info.value) or "Method Not Allowed" in str(exc_info.value)


async def test_allowed_methods_work(client):
    """
    Test that allowed methods (GET, POST, PATCH, OPTIONS)
    don't get blocked by the middleware.
    """
    # Test regular HTTP methods (not CORS preflight)
    # Use correct endpoints for each method that are actually implemented
    test_cases = [
        ("GET", "/projects", None),
        ("POST", "/projects", {}),
        (
            "PATCH",
            "/projects/123e4567-e89b-12d3-a456-426614174000",
            {},
        ),  # PATCH needs project ID
    ]

    for method, endpoint, json_data in test_cases:
        # Each method should not be blocked by our middleware
        # (it might fail for other reasons like database connection, but not 405)
        try:
            response = await client.request(method, endpoint, json=json_data)
            # Should not return 405
            # (it might return other status codes like 200, 401, 500, etc.)
            if hasattr(response, "status_code"):
                assert response.status_code != status.HTTP_405_METHOD_NOT_ALLOWED, (
                    f"{method} {endpoint} should not return 405"
                )
        except Exception as e:
            # If an exception is raised, it should not be a 405 Method Not Allowed
            assert "405: HTTP method" not in str(e) and "Method Not Allowed" not in str(e), (
                f"{method} method should not be blocked by middleware"
            )

    # Test OPTIONS as CORS preflight (which is the typical use case)
    cors_headers = {
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "GET",
    }
    try:
        response = await client.options("/projects", headers=cors_headers)
        # CORS preflight OPTIONS should not return 405
        if hasattr(response, "status_code"):
            assert response.status_code != status.HTTP_405_METHOD_NOT_ALLOWED, (
                "OPTIONS method (CORS preflight) should not return 405"
            )
    except Exception as e:
        # If an exception is raised, it should not be a 405 Method Not Allowed
        assert "405: HTTP method" not in str(e) and "Method Not Allowed" not in str(e), (
            "OPTIONS method should not be blocked by middleware"
        )


async def test_options_method_for_cors(client):
    """Test OPTIONS method specifically for CORS preflight requests."""
    # CORS preflight requests include Origin
    # and Access-Control-Request-Method headers
    cors_headers = {
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "content-type",
    }

    try:
        response = await client.options("/projects", headers=cors_headers)
        # CORS preflight should not return 405
        # (it might return 200, 204, or other valid status codes)
        # but definitely not 405 which means method not allowed
        if hasattr(response, "status_code"):
            assert response.status_code != status.HTTP_405_METHOD_NOT_ALLOWED, (
                "OPTIONS method should be allowed for CORS preflight"
            )
            # Also verify CORS headers are present
            assert "access-control-allow-methods" in response.headers, "CORS headers should be present"
            assert "OPTIONS" in response.headers.get("access-control-allow-methods", ""), (
                "OPTIONS should be in allowed methods"
            )
    except Exception as e:
        # If an exception is raised, it should not be a 405 Method Not Allowed
        assert "405: HTTP method" not in str(e) and "Method Not Allowed" not in str(e), (
            "OPTIONS method should not be blocked by middleware"
        )


async def test_trace_method_blocked_on_root(client):
    """Test TRACE method is blocked on root endpoint."""
    with pytest.raises(Exception) as exc_info:
        await client.request("TRACE", "/")
    assert "405: HTTP method 'TRACE' is not allowed" in str(exc_info.value)


async def test_put_method_blocked_on_any_endpoint(client):
    """Test PUT method is blocked on any endpoint."""
    with pytest.raises(Exception) as exc_info:
        await client.request("PUT", "/projects/123", json={})
    assert "405: HTTP method 'PUT' is not allowed" in str(exc_info.value)
