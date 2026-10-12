ARG INCLUDE_DEPENDENCIES=prod
ARG BASE_IMAGE_DEV=python:3.13.14-slim-trixie
# Internal mirror of the ZendIS Python image.
ARG BASE_IMAGE=registry.opencode.de/oci-community/images/zendis/python3:3.13-minimal@sha256:6d5c42992913b6918097e3ab7df635134da62e7dcd41247a7066ffe367191ca6

FROM ${BASE_IMAGE_DEV} AS builder

ENV DEBIAN_FRONTEND=noninteractive
# some apt packages usually needed in Python projects
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    apt-get update && apt-get install -y git curl gcc libpq-dev

# Shared Python image build steps, see docker/python-build/README.md: stage the
# runtime libs the minimal final image omits and install the pinned uv.
COPY docker/python-build/ /opt/python-build/
RUN sh /opt/python-build/stage-runtime-libs.sh
RUN sh /opt/python-build/install-uv.sh

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

# Repoint the venv interpreter for the minimal final image and smoke-test the
# native dependencies.
RUN sh /opt/python-build/repoint-venv-python.sh spacy presidio_analyzer pikepdf

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

# Curate a clean /ocr-root staging tree so the nix-based final image is NOT
# clobbered by Debian's full /usr/lib (which contains ssl/apt/dpkg/systemd dirs
# that conflict with the minimal base). We copy only: the OCR binaries, their
# ldd-resolved shared libraries (with soname symlinks), and the runtime data
# dirs (tessdata, ghostscript, poppler, color, fonts). This tree is overlaid
# onto / in the final stage.
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

# Overlay the curated OCR toolchain (binaries + only their needed libs + data),
# avoiding a wholesale /usr/lib copy that would clobber the minimal base.
COPY --from=ocr-tools /ocr-root/ /
COPY --from=selected-deps /app/.venv /app/.venv
# Runtime libs staged in the builder. Placed AFTER the OCR lib overlay so our
# known-good libstdc++/libgcc_s/libgomp land last.
COPY --from=builder /extra-libs/ /usr/lib/
COPY . .

CMD ["python", "05-modulcluster/modul-anonymisierung/main.py"]
