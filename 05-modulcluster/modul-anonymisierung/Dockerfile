ARG INCLUDE_DEPENDENCIES=prod
ARG BASE_IMAGE_DEV=python:3.13-slim
ARG BASE_IMAGE=registry.opencode.de/oci-community/images/zendis/python3:3.13-minimal

FROM ${BASE_IMAGE_DEV} AS builder

ENV DEBIAN_FRONTEND=noninteractive
# some apt packages usually needed in Python projects
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    apt-get update && apt-get install -y git curl gcc libpq-dev

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

# Upgrade pip to a specific version
RUN python -m pip install --upgrade pip==25.3

# install uv via pip
RUN pip install uv==0.9.6

# UV_PROJECT_ENVIRONMENT configures the environment for the uv project interface
# UV_PYTHON configures the python executable for the uv pip interface
ENV UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_PYTHON=3.13 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_FROZEN=1

FROM builder AS deps-prod

WORKDIR /src

COPY pyproject.toml uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-install-workspace --all-extras --no-dev --package anonymisierung

FROM deps-prod AS deps-dev

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-install-workspace --only-group dev --inexact

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-install-workspace --all-extras --inexact --package anonymisierung -v

# -------------------------------------------------------------
FROM deps-${INCLUDE_DEPENDENCIES} AS selected-deps

WORKDIR /src

COPY . .

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --all-extras --inexact --package anonymisierung

# --- minimal-base compatibility snippet (2/3) ---------------------------------
# The venv is built here (interpreter at /usr/local/bin/python3.13) but runs in
# the final base image. On minimal/nix-based bases that exact path is absent, so
# repoint the venv interpreter to /usr/local/bin/python3, which exists in both.
# Guarded so it is a harmless no-op on standard (e.g. python:3.13-slim) bases.
# The import check is a build-time smoke test for the interpreter and native deps.
RUN set -eux; \
    if [ -e /usr/local/bin/python3 ]; then \
      ln -sf /usr/local/bin/python3 /app/.venv/bin/python; \
      ln -sf /usr/local/bin/python3 /app/.venv/bin/python3; \
      ln -sf /usr/local/bin/python3 /app/.venv/bin/python3.13; \
    fi; \
    /app/.venv/bin/python -c "import spacy, presidio_analyzer, pikepdf; print('venv OK')"
# ------------------------------------------------------------------------------

FROM ${BASE_IMAGE_DEV} AS ocr-tools

ENV DEBIAN_FRONTEND=noninteractive
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-deu \
    ghostscript \
    poppler-utils \
    qpdf \
    && rm -rf /var/lib/apt/lists/*

# Curate a clean /ocr-root staging tree so a minimal final image is NOT
# clobbered by Debian's full /usr/lib. Copy only: the OCR binaries, their
# ldd-resolved shared libraries (with soname symlinks), and the runtime data
# dirs (tessdata, ghostscript, poppler, color, fonts). This tree is overlaid
# onto / in the final stage. Safe on full bases too.
RUN set -eux; \
    mkdir -p /ocr-root/usr/bin /ocr-root/usr/share /ocr-root/etc/fonts; \
    for b in gs pdfinfo pdftoppm qpdf tesseract; do \
      cp -a "/usr/bin/$b" /ocr-root/usr/bin/; \
    done; \
    for b in gs pdfinfo pdftoppm qpdf tesseract; do \
      ldd "/usr/bin/$b" 2>/dev/null | awk '/=>/ {print $3} !/=>/ {print $1}' | grep -E '^/(usr/)?lib' || true; \
    done | sort -u | while read -r so; do \
      [ -e "$so" ] || continue; \
      real="$(readlink -f "$so")"; \
      mkdir -p "/ocr-root$(dirname "$so")"; \
      cp -a "$real" "/ocr-root$(dirname "$so")/$(basename "$real")"; \
      if [ "$(basename "$real")" != "$(basename "$so")" ]; then \
        ln -sf "$(basename "$real")" "/ocr-root$so"; \
      fi; \
    done; \
    for d in tesseract-ocr tessdata ghostscript poppler color; do \
      [ -d "/usr/share/$d" ] && cp -a "/usr/share/$d" /ocr-root/usr/share/ || true; \
    done; \
    [ -d /etc/fonts ] && cp -a /etc/fonts/. /ocr-root/etc/fonts/ || true

FROM ${BASE_IMAGE} AS final

WORKDIR /src

ENV VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:/usr/local/bin:/usr/bin:/bin:$PATH" \
    SKIP_DOTENV=true

# Overlay the curated OCR toolchain (binaries + only their needed libs + data).
COPY --from=ocr-tools /ocr-root/ /
COPY --from=selected-deps /app/.venv /app/.venv
# --- minimal-base compatibility snippet (3/3) ---------------------------------
# Provide the runtime libs staged in the builder. /usr/lib is on the loader path
# in both full and minimal bases, so this is arch-agnostic. On full bases it
# overlays compatible libs already present (harmless).
COPY --from=builder /extra-libs/ /usr/lib/
# ------------------------------------------------------------------------------
COPY . .

CMD ["python", "05-modulcluster/modul-anonymisierung/main.py"]
