"""Main FastAPI application."""

from event_logging.middleware import EventLoggingMiddleware
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

from src.api.middlewares.cors import add_cors
from src.api.middlewares.http_method_restrictions import HTTPMethodRestrictionsMiddleware
from src.api.middlewares.security_headers import SecurityHeadersMiddleware
from src.api.routers import api_router
from src.api.routes.probe_router import probe_router
from src.config.handlers import register_exception_handlers
from src.config.settings import settings
from src.lifespan import lifespan

app = FastAPI(
    title="Identity Management Service",
    description="Returns user identity claims from a validated Bearer token.",
    version="0.1.0",
    lifespan=lifespan,
)

# Middlewares are executed in LIFO order
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(HTTPMethodRestrictionsMiddleware)
add_cors(app)
app.add_middleware(
    EventLoggingMiddleware,
    service_name=settings.SERVICE_NAME,
    skip_paths=["/healthz", "/ready", "/startup", "/metrics"],
)

register_exception_handlers(app=app)

Instrumentator().instrument(app).expose(app)

app.include_router(api_router)
app.include_router(probe_router)
