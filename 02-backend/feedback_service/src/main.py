"""Feedback Service - FastAPI Application."""

from event_logging.middleware import EventLoggingMiddleware
from fastapi import FastAPI
from node_crud import (
    build_http_latest_version_resolver,
    build_http_version_lock_validator,
    build_http_write_version_validator,
    generate_node_routes,
)
from prometheus_fastapi_instrumentator import Instrumentator

from src.api.middlewares.cors import add_cors
from src.api.middlewares.security_headers import SecurityHeadersMiddleware
from src.api.routes.probe_router import probe_router
from src.config.handlers import register_exception_handlers
from src.config.settings import settings
from src.models.db.database import get_db_session
from src.models.db_models import Base
from src.utils.lifespan import lifespan

app = FastAPI(
    title="Feedback Service",
    description="Microservice for storing user feedback via auto-generated node-crud routes",
    version="1.0.0",
    lifespan=lifespan,
)

Instrumentator().instrument(app).expose(app)

register_exception_handlers(app=app)

app.include_router(
    generate_node_routes(
        base=Base,
        get_db_session=get_db_session,
        get_latest_version=build_http_latest_version_resolver(settings.PROJECT_LOGIC_SERVICE_URL),
        validate_write_version=build_http_write_version_validator(settings.PROJECT_LOGIC_SERVICE_URL),
        validate_version_lock=build_http_version_lock_validator(settings.PROJECT_LOGIC_SERVICE_URL),
    )
)
app.include_router(probe_router)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    EventLoggingMiddleware,
    service_name=settings.SERVICE_NAME,
    skip_paths=["/healthz", "/metrics", "/ready", "/startup"],
)
add_cors(app)
