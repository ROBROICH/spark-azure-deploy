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
# This image has always staged only the C++ runtime, not libgomp.
RUN sh /opt/python-build/stage-runtime-libs.sh libstdc++.so.6 libgcc_s.so.1
RUN sh /opt/python-build/install-uv.sh

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

# Repoint the venv interpreter for the minimal final image and smoke-test the
# native dependencies.
RUN sh /opt/python-build/repoint-venv-python.sh uvicorn grpc

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
# Runtime libs staged in the builder (/usr/lib is on the loader path everywhere).
COPY --from=builder /extra-libs/ /usr/lib/
COPY . .
ENV ALEMBIC_CONFIG="/src/04-shared-services/basiskomponenten/rechtsaenderungs-monitoring/alembic.ini"
WORKDIR /src/04-shared-services/basiskomponenten/rechtsaenderungs-monitoring

CMD ["uvicorn", "rechtsaenderungsmonitoring.service:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
