#!/bin/sh
# Shared build step for the Python service and module images (dependency stage).
#
# The venv at /app/.venv is built with the builder interpreter
# (/usr/local/bin/python3.13) but runs in the final base image. On minimal/nix-
# based bases that exact path is absent, so the venv interpreter is repointed to
# /usr/local/bin/python3, which exists in both. The step is guarded, so it is a
# harmless no-op on standard (e.g. DHI) bases.
#
# Afterwards the given modules are imported as a build-time smoke test for the
# interpreter and the native dependencies. Without modules, only the
# interpreter is checked.
#
# Usage: repoint-venv-python.sh [module ...]
set -eux

VENV=/app/.venv

if [ -e /usr/local/bin/python3 ]; then
  ln -sf /usr/local/bin/python3 "$VENV/bin/python"
  ln -sf /usr/local/bin/python3 "$VENV/bin/python3"
  ln -sf /usr/local/bin/python3 "$VENV/bin/python3.13"
fi

if [ "$#" -eq 0 ]; then
  "$VENV/bin/python" -c "import sys; print(sys.version)"
else
  modules="$(printf '%s, ' "$@")"
  "$VENV/bin/python" -c "import ${modules%, }; print('venv OK')"
fi
