ARG BASE_IMAGE_DEV=python:3.13-slim
ARG BASE_IMAGE=python:3.13-slim

FROM ${BASE_IMAGE_DEV} AS builder

ENV DEBIAN_FRONTEND=noninteractive
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    apt-get update && apt-get install -y git curl gcc libpq-dev libgomp1

RUN pip install uv==0.5.27

ENV UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_PYTHON=3.13 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_FROZEN=1

FROM builder AS deps

WORKDIR /src

COPY pyproject.toml uv.lock  ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-install-workspace --all-extras --no-dev --package modul-suche-und-zuordnung

COPY . .

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --all-extras --no-dev --inexact --package modul-suche-und-zuordnung

RUN TIKTOKEN_CACHE_DIR=/app/.tiktoken_cache /app/.venv/bin/python -c "import tiktoken; tiktoken.get_encoding('cl100k_base')"

RUN groupadd -r appuser && useradd -r -g appuser -s /sbin/nologin appuser

FROM ${BASE_IMAGE} AS final

WORKDIR /src

ENV VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    SKIP_DOTENV=true \
    TIKTOKEN_CACHE_DIR=/app/.tiktoken_cache \
    PYTHONPATH="/src/05-modulcluster/modul-suche-und-zuordnung"

COPY --from=deps /etc/passwd /etc/passwd
COPY --from=deps /etc/group /etc/group

COPY --chown=appuser:appuser --from=deps /app/.venv /app/.venv
COPY --chown=appuser:appuser --from=deps /app/.tiktoken_cache /app/.tiktoken_cache
COPY --chown=appuser:appuser . .

USER appuser

CMD ["python", "05-modulcluster/modul-suche-und-zuordnung/main.py"]
