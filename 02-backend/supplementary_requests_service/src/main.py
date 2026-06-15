"""Main FastAPI application."""

from audit_client import AuditContextMiddleware, audit_actor_dependency
from event_logging.middleware import EventLoggingMiddleware
from fastapi import Depends, FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

from src.api.middlewares.cors import add_cors
from src.api.middlewares.http_method_restrictions import (
    HTTPMethodRestrictionsMiddleware,
)
from src.api.middlewares.security_headers import SecurityHeadersMiddleware
from src.api.routers import api_router
from src.api.routes.probe_router import probe_router
from src.config.handlers import register_exception_handlers
from src.config.settings import settings
from src.lifespan import lifespan

app = FastAPI(
    title="Supplementary Requests Service",
    description="Microservice for managing supplementary requests",
    version="0.1.0",
    lifespan=lifespan,
)

# Middlewares are executed in LIFO order
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(HTTPMethodRestrictionsMiddleware)
add_cors(app)
app.add_middleware(AuditContextMiddleware)
app.add_middleware(
    EventLoggingMiddleware,
    service_name=settings.SERVICE_NAME,
    skip_paths=["/healthz", "/ready", "/startup", "/metrics"],
)

# Exception Handlers
register_exception_handlers(app=app)

# adds /metrics endpoint for Prometheus to scrape
Instrumentator().instrument(app).expose(app)

app.include_router(api_router, dependencies=[Depends(audit_actor_dependency)])
app.include_router(probe_router)
