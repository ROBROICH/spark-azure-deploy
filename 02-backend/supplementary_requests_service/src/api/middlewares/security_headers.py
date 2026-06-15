from typing import override

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.types import ASGIApp

from src.config.constants import AUTH_EXCLUDED_PATHS


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware for adding security-related HTTP headers.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    @override
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if self._is_excluded_path(request.url.path):
            return await call_next(request)

        response = await call_next(request)

        csp_directives = [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "connect-src 'self'",
            "font-src 'self'",
            "object-src 'none'",
            "frame-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ]
        response.headers["Content-Security-Policy"] = "; ".join(csp_directives)

        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

        response.headers["X-Content-Type-Options"] = "nosniff"

        response.headers["X-Frame-Options"] = "SAMEORIGIN"

        response.headers["Referrer-Policy"] = "same-origin"

        response.headers["X-XSS-Protection"] = "1; mode=block"

        response.headers["Cache-Control"] = "no-cache, no-store, private, must-revalidate"

        return response

    def _is_excluded_path(self, path: str) -> bool:
        if path in AUTH_EXCLUDED_PATHS:
            return True

        return path.startswith("/static/")
