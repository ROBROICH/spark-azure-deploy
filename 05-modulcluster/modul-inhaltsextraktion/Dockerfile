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

FROM builder AS deps

WORKDIR /src

COPY pyproject.toml uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-install-workspace --all-extras --no-dev --package 2-inhaltsextraktion-und-suche

COPY . .

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --all-extras --no-dev --inexact --package 2-inhaltsextraktion-und-suche

FROM ${BASE_IMAGE} AS final

WORKDIR /src

ENV VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    SKIP_DOTENV=true

COPY --from=deps /app/.venv /app/.venv
# pre-cache tiktoken encoding
RUN ["python", "-c", "import tiktoken; tiktoken.get_encoding('cl100k_base')"]
RUN ["python", "-c", "from transformers import AutoTokenizer; AutoTokenizer.from_pretrained('protectai/deberta-v3-base-prompt-injection-v2', revision='e6535ca4ce3ba852083e75ec585d7c8aeb4be4c5')"]
RUN ["python", "-c", "from transformers import AutoTokenizer; AutoTokenizer.from_pretrained('openai/gpt-oss-120b', revision='8c0580383cb1e6a9157669336ade6797a024cd9a')"]
COPY . .
ENV TRANSFORMERS_OFFLINE=1
CMD ["python", "05-modulcluster/modul-inhaltsextraktion/main.py"]
