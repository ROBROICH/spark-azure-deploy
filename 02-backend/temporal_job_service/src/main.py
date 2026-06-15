import sys

from event_logging.middleware import EventLoggingMiddleware
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from temporal.observability import ObservabilityConfig, setup_observability

from src.api.middlewares.security_headers import SecurityHeadersMiddleware
from src.api.routes.internal_tracking import router as internal_tracking_router
from src.api.routes.job_service import router as job_router
from src.api.routes.probe_router import probe_router
from src.config.settings import settings
from src.utils.lifespan import lifespan


def create_app() -> FastAPI:
    """Build the FastAPI app. Fresh instance per call for testability."""
    setup_observability(
        ObservabilityConfig(
            service_name=settings.OTEL_SERVICE_NAME,
            otel_endpoint=settings.OTEL_ENDPOINT,
        )
    )
    app = FastAPI(lifespan=lifespan)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        EventLoggingMiddleware,
        service_name=settings.SERVICE_NAME,
        skip_paths=["/healthz", "/metrics"],
    )
    app.include_router(job_router)
    app.include_router(probe_router)
    app.include_router(internal_tracking_router)

    return app


if "pytest" not in sys.modules:
    app = create_app()
    Instrumentator().instrument(app).expose(app)
