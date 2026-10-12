#!/usr/bin/env bash
# Launch a tmux session running everything needed for local
# gesetze-normen-db + Temporal development.
#
# Usage: ./04-shared-services/db-services/gesetze-normen-db-service/start_with_temporal.sh
# hit `Ctrl+B :` and type kill-session to stop everything and clean up.
set -euo pipefail

SESSION="${SESSION:-gesetze-normen}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

DOCKER_SERVICES=(
  postgresql
  temporal
  temporal-init
  temporal-ui
  versitygw
)

PROCESS_COMPOSE_SERVICES=(
  gesetze-normen-db
  worker-gesetze-normen-db
  temporal-job
)

cd "$REPO_ROOT"

command -v tmux >/dev/null || { echo "tmux not found in PATH" >&2; exit 1; }
command -v docker >/dev/null || { echo "docker not found in PATH" >&2; exit 1; }
command -v process-compose >/dev/null || { echo "process-compose not found in PATH" >&2; exit 1; }

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Session '$SESSION' already exists — attaching."
  exec tmux attach -t "$SESSION"
fi

# Single window with three panes.
# Pane 0 (top-left): docker compose. The otel-collector lives behind the
# "observability" profile, so it must be activated explicitly.
tmux new-session -d -s "$SESSION" -n main -c "$REPO_ROOT"
tmux send-keys -t "$SESSION:main.0" \
  "docker compose up ${DOCKER_SERVICES[*]}" C-m

# Pane 1 (right): spare shell. Split horizontally first so it spans full height.
tmux split-window -h -t "$SESSION:main.0" -l 40% -c "$REPO_ROOT"

# Pane 2 (bottom-left): process-compose. Waits for Temporal's gRPC port before
# starting so the worker doesn't crash-loop on first boot.
tmux split-window -v -t "$SESSION:main.0" -c "$REPO_ROOT"
tmux send-keys -t "$SESSION:main.2" \
  "echo 'Waiting for Temporal (localhost:7233)…'; \
until nc -z localhost 7233 2>/dev/null; do sleep 1; done; \
echo 'Temporal is up. Starting process-compose.'; \
process-compose up ${PROCESS_COMPOSE_SERVICES[*]}" C-m

tmux select-pane -t "$SESSION:main.1"
exec tmux attach -t "$SESSION"
