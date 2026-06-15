from event_logging.middleware import EventLoggingMiddleware
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

from src.api.middlewares.cors import add_cors
from src.api.middlewares.security_headers import SecurityHeadersMiddleware
from src.api.routes.fpp_api import router as fpp_router
from src.api.routes.fpp_internal_api import router as fpp_internal_router
from src.api.routes.probe_router import probe_router
from src.config.settings import settings
from src.exceptions.exception_handlers import register_exception_handlers
from src.lifespan import lifespan

app = FastAPI(
    title="FPP Service",
    description="Fachplanungsportal Integration Service",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    EventLoggingMiddleware,
    service_name=settings.SERVICE_NAME,
    skip_paths=["/healthz", "/metrics"],
)
add_cors(app)

# Exception Handlers
register_exception_handlers(app)

# Prometheus metrics endpoint
Instrumentator().instrument(app).expose(app)

# API Routes
app.include_router(fpp_router)
app.include_router(fpp_internal_router)
app.include_router(probe_router)
