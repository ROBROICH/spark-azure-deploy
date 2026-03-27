ARG INCLUDE_DEPENDENCIES=prod
ARG BASE_IMAGE_DEV=python:3.13-slim
ARG BASE_IMAGE=python:3.13-slim

FROM ${BASE_IMAGE_DEV} AS builder

ENV DEBIAN_FRONTEND=noninteractive
# apt packages needed for Python projects
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
        git \
        curl \
        gcc \
        libpq-dev \
        tzdata \
        libgomp1 && \
    ln -fs /usr/share/zoneinfo/Europe/Berlin /etc/localtime && \
    dpkg-reconfigure -f noninteractive tzdata && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# install uv via pip
RUN pip install uv==0.5.27

# UV_PROJECT_ENVIRONMENT configures the environment for the uv project interface
# UV_PYTHON configures the python executable for the uv pip interface
ENV UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_PYTHON=3.13 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_FROZEN=1

# -------------------------------------------------------------
FROM builder AS deps-prod

WORKDIR /src

COPY pyproject.toml uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-install-workspace --all-extras --no-dev --package 2-inhaltsextraktion-und-suche

FROM deps-prod AS deps-dev

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-install-workspace --only-group dev --inexact

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-install-workspace --all-extras --inexact --package 2-inhaltsextraktion-und-suche -v

# -------------------------------------------------------------
FROM deps-${INCLUDE_DEPENDENCIES} AS selected-deps

WORKDIR /src

COPY . .

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --all-extras --inexact --package 2-inhaltsextraktion-und-suche

FROM ${BASE_IMAGE} AS final

WORKDIR /src

ENV VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    SKIP_DOTENV=true


# Align with nonroot user (UID 65532) from hardened DHI base images
RUN id -u nonroot >/dev/null 2>&1 || \
    (groupadd --gid 65532 nonroot && \
     useradd --uid 65532 --gid nonroot --no-create-home --shell /sbin/nologin nonroot)

COPY --from=selected-deps /app/.venv /app/.venv

# pre-cache tiktoken encoding
ENV TIKTOKEN_CACHE_DIR=/tmp/tiktoken_cache
RUN ["python", "-c", "import tiktoken; tiktoken.get_encoding('cl100k_base')"]

COPY . .

USER nonroot

CMD ["python", "05-modulcluster/modul-inhaltsextraktion/main.py"]
