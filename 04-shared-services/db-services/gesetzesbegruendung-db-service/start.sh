#!/usr/bin/env sh
set -e

gunicorn begruendungen_db.service:app -w 1 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --log-level ${LOG_LEVEL:-"info"}
