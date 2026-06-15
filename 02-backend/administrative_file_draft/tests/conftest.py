"""Test configuration."""

import os


def pytest_sessionfinish(session, exitstatus):
    """Treat 'no tests selected' (exit code 5) as success for CI.

    All integration tests are deselected by default via ``-m 'not integration'``.
    When no unit tests exist yet, pytest would otherwise fail the build.
    """
    if exitstatus == 5:
        session.exitstatus = 0


# Force pure-Python psycopg to avoid segfaults with psycopg-binary + pglite.
# The pytest_postgresql plugin is also blocked via addopts (-p no:pytest_postgresql)
# to prevent it from importing psycopg with the binary backend before this runs.
os.environ["PSYCOPG_IMPL"] = "python"

_TEST_ENV_VARS = {
    "DB_USER": "test",
    "DB_PASSWORD": "test",
    "DB_HOST": "localhost",
    "DB_PORT": "5432",
    "DB_NAME": "test_db",
    "SERVICE_NAME": "administrative-file-draft-test",
    "AUTH_MODE": "disabled",
}
for key, value in _TEST_ENV_VARS.items():
    os.environ.setdefault(key, value)
