from typing import override

from fastapi import HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from src.config.settings import settings


class HTTPMethodRestrictionsMiddleware(BaseHTTPMiddleware):
    """Middleware to block unsafe HTTP methods (e.g. TRACE, PUT)."""

    @override
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method in settings.BLOCKED_HTTP_METHODS:
            raise HTTPException(
                status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
                detail=f"HTTP method '{request.method}' is not allowed",
            )
        return await call_next(request)
