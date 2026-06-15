ARG BASE_IMAGE_DEV=python:3.13-slim
ARG BASE_IMAGE=python:3.13-slim

FROM ${BASE_IMAGE_DEV} AS builder

ENV DEBIAN_FRONTEND=noninteractive

# install uv via pip
RUN pip install uv==0.5.27

# UV_PROJECT_ENVIRONMENT configures the environment for the uv project interface
# UV_PYTHON configures the python executable for the uv pip interface
ENV UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_PYTHON=3.13 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_FROZEN=1

FROM builder AS deps

WORKDIR /src

COPY pyproject.toml uv.lock  ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-install-workspace --no-dev --package rechtsaenderungsmonitoring

COPY . .

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --package rechtsaenderungsmonitoring --no-dev

FROM deps AS deps-dev

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-install-workspace --only-group test --inexact

ENV VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    SKIP_DOTENV=true

FROM ${BASE_IMAGE} AS final

WORKDIR /src

ENV VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    SKIP_DOTENV=true

COPY --from=deps /app/.venv /app/.venv
COPY . .
ENV ALEMBIC_CONFIG="/src/04-shared-services/basiskomponenten/rechtsaenderungs-monitoring/alembic.ini"
WORKDIR /src/04-shared-services/basiskomponenten/rechtsaenderungs-monitoring

CMD ["uvicorn", "rechtsaenderungsmonitoring.service:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
