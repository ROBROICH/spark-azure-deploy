#!/usr/bin/env sh
set -e

uvicorn jura_db.service:app --host 0.0.0.0 --port 8000 --log-level ${LOG_LEVEL:-"info"}
