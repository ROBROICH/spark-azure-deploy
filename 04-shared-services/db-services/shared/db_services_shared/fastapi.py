"""fastapi app factory"""

from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

from event_logging.middleware import EventLoggingMiddleware
from db_services_shared.api.middlewares.security_headers import SecurityHeadersMiddleware
from db_services_shared.api.middlewares.cors import add_cors
from db_services_shared.exceptions.exception_handlers import register_exception_handlers

from db_services_shared.api.routes.probe_router import probe_router

from db_services_shared.config.settings import CommonSettings
from db_services_shared.models.db.database import init_database

def app_factory(service_name: str, settings: CommonSettings, **kwargs) -> FastAPI:
    """bootstrap a fastapi app with middlewares and prometheus metrics"""

    init_database(settings)

    app = FastAPI(title=service_name, **kwargs)

    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        EventLoggingMiddleware,
        service_name=service_name,
        skip_paths=["/health", "/metrics"],
        )
    add_cors(app, settings)

    # adds /metrics endpoint for Prometheus to scrape
    app.state.instrumentator = Instrumentator().instrument(app)
    app.state.instrumentator.expose(app, tags=["probes"])  # exclude metrics for probes

    # Exception Handlers
    register_exception_handlers(app)

    app.include_router(probe_router)

    return app
