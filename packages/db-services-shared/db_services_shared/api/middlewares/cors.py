from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db_services_shared.config.settings import CommonSettings


def add_cors(app: FastAPI, settings: CommonSettings) -> None:
    """Register CORS middleware with configured origins and methods."""
    origins = settings.BACKEND_CORS_ORIGINS
    if "*" in origins:
        raise ValueError("Wildcard CORS origin is not allowed when credentials are enabled")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=settings.ALLOWED_HTTP_METHODS,
        allow_credentials=True,
        allow_headers=["*"],
    )
