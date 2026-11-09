"""Point pytest-postgresql at an already-running server via PYTEST_POSTGRES_EXTERNAL.

Usage in a service conftest.py::

    if use_external_postgres():
        postgresql_noproc = external_postgres_server()
        postgresql = factories.postgresql("postgresql_noproc")
"""

import os
from typing import Any, Callable

from pytest_postgresql import factories

_TRUTHY = frozenset({"1", "true", "yes", "on"})

EXTERNAL_ENV_VAR = "PYTEST_POSTGRES_EXTERNAL"


def use_external_postgres() -> bool:
    """Return whether tests should connect to an already-running PostgreSQL."""
    return os.environ.get(EXTERNAL_ENV_VAR, "").strip().lower() in _TRUTHY


def external_postgres_server() -> Callable[..., Any]:
    """Build a ``postgresql_noproc`` fixture from the ``DB_*`` environment variables."""
    return factories.postgresql_noproc(
        host=os.environ.get("DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("DB_PORT", "5432")),
        user=os.environ.get("DB_USER", "postgres"),
        password=os.environ.get("DB_PASSWORD", "postgres"),
    )
