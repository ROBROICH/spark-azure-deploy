ARG BASE_IMAGE_DEV=python:3.13-slim
ARG BASE_IMAGE=registry.opencode.de/oci-community/images/zendis/python3:3.13-minimal

FROM ${BASE_IMAGE_DEV} AS builder

ENV DEBIAN_FRONTEND=noninteractive
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    apt-get update && apt-get install -y git curl gcc libpq-dev libgomp1

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

# --- minimal-base compatibility snippet (2/3) ---------------------------------
# The venv is built here (interpreter at /usr/local/bin/python3.13) but runs in
# the final base image. On minimal/nix-based bases that exact path is absent, so
# repoint the venv interpreter to /usr/local/bin/python3, which exists in both.
# Guarded so it is a harmless no-op on standard (e.g. python:3.13-slim) bases.
# Placed BEFORE the tiktoken warm-up RUN below so the repointed interpreter is
# used. The import check is a build-time smoke test for interpreter + native deps.
RUN set -eux; \
    if [ -e /usr/local/bin/python3 ]; then \
      ln -sf /usr/local/bin/python3 /app/.venv/bin/python; \
      ln -sf /usr/local/bin/python3 /app/.venv/bin/python3; \
      ln -sf /usr/local/bin/python3 /app/.venv/bin/python3.13; \
    fi; \
    /app/.venv/bin/python -c "import tiktoken; print('venv OK')"
# ------------------------------------------------------------------------------

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
# --- minimal-base compatibility snippet (3/3) ---------------------------------
# Provide the runtime libs staged in the builder. /usr/lib is on the loader path
# in both full and minimal bases, so this is arch-agnostic. On full bases it
# overlays compatible libs already present (harmless).
COPY --from=builder /extra-libs/ /usr/lib/
# ------------------------------------------------------------------------------
COPY --chown=appuser:appuser --from=deps /app/.tiktoken_cache /app/.tiktoken_cache
COPY --chown=appuser:appuser . .

USER appuser

CMD ["python", "05-modulcluster/modul-suche-und-zuordnung/main.py"]
