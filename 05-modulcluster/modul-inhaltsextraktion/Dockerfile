ARG BASE_IMAGE_DEV=python:3.13-slim
ARG BASE_IMAGE=registry.opencode.de/oci-community/images/zendis/python3:3.13-minimal

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

# --- minimal-base compatibility snippet (1/3) ---------------------------------
# Stage the C++/OpenMP runtime libs needed by compiled wheels (e.g. grpcio's
# cygrpc, numpy/scikit/spaCy). Standard bases (e.g. python:3.13-slim) already
# ship these, so this is a harmless no-op there; on a minimal/nix-based final
# image it provides libs that image omits. Arch is detected at build time so it
# works under both Kaniko (CI) and BuildKit on amd64 and arm64, without the
# TARGETARCH build-arg (which Kaniko does not populate). Missing libs are skipped.
RUN set -eux; \
    mkdir -p /extra-libs; \
    ARCHDIR="$(dpkg-architecture -qDEB_HOST_MULTIARCH 2>/dev/null || echo "$(uname -m)-linux-gnu")"; \
    for lib in libstdc++.so.6 libgcc_s.so.1 libgomp.so.1; do \
      src="$(readlink -f "/usr/lib/$ARCHDIR/$lib" 2>/dev/null || true)"; \
      [ -n "$src" ] && [ -e "$src" ] || continue; \
      cp -a "$src" /extra-libs/; \
      if [ "$(basename "$src")" != "$lib" ]; then \
        ln -sf "$(basename "$src")" "/extra-libs/$lib"; \
      fi; \
    done
# ------------------------------------------------------------------------------

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

# --- minimal-base compatibility snippet (2/3) ---------------------------------
# The venv is built here (interpreter at /usr/local/bin/python3.13) but runs in
# the final base image. On minimal/nix-based bases that exact path is absent, so
# repoint the venv interpreter to /usr/local/bin/python3, which exists in both.
# Guarded so it is a harmless no-op on standard (e.g. python:3.13-slim) bases.
# The import check is a build-time smoke test for the interpreter and native deps.
# (importing transformers does not download models; it only loads the library.)
RUN set -eux; \
    if [ -e /usr/local/bin/python3 ]; then \
      ln -sf /usr/local/bin/python3 /app/.venv/bin/python; \
      ln -sf /usr/local/bin/python3 /app/.venv/bin/python3; \
      ln -sf /usr/local/bin/python3 /app/.venv/bin/python3.13; \
    fi; \
    /app/.venv/bin/python -c "import transformers, tiktoken; print('venv OK')"
# ------------------------------------------------------------------------------

FROM ${BASE_IMAGE} AS final

WORKDIR /src

ENV VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    SKIP_DOTENV=true

COPY --from=deps /app/.venv /app/.venv
# --- minimal-base compatibility snippet (3/3) ---------------------------------
# Provide the runtime libs staged in the builder. /usr/lib is on the loader path
# in both full and minimal bases, so this is arch-agnostic. On full bases it
# overlays compatible libs already present (harmless). Placed BEFORE the model
# precache RUN steps below, which execute python in this (possibly minimal) final
# image and therefore need the interpreter + libstdc++/libgomp present first.
COPY --from=builder /extra-libs/ /usr/lib/
# ------------------------------------------------------------------------------
# pre-cache tiktoken encoding
RUN ["python", "-c", "import tiktoken; tiktoken.get_encoding('cl100k_base')"]
RUN ["python", "-c", "from transformers import AutoTokenizer; AutoTokenizer.from_pretrained('protectai/deberta-v3-base-prompt-injection-v2', revision='e6535ca4ce3ba852083e75ec585d7c8aeb4be4c5')"]
RUN ["python", "-c", "from transformers import AutoTokenizer; AutoTokenizer.from_pretrained('openai/gpt-oss-120b', revision='8c0580383cb1e6a9157669336ade6797a024cd9a')"]
COPY . .
ENV TRANSFORMERS_OFFLINE=1
CMD ["python", "05-modulcluster/modul-inhaltsextraktion/main.py"]
