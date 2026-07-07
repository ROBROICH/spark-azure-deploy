#!/usr/bin/env bash
# Re-apply the Azure demo overlay patches onto an openCode source tree.
#
# See patches/README.md. Idempotent: patches already present in the tree are
# skipped, so this is safe to run repeatedly. Intended for the sync-and-build
# pipeline after a fresh upstream checkout, and for local maintenance.
set -euo pipefail
cd "$(dirname "$0")/.."
shopt -s nullglob
status=0
for p in patches/[0-9]*.patch; do
  if git apply --reverse --check "$p" 2>/dev/null; then
    echo "skip (already applied): $p"
    continue
  fi
  if git apply --check "$p" 2>/dev/null; then
    git apply --whitespace=nowarn "$p"
    echo "applied: $p"
  else
    echo "FAILED (upstream drift - reconcile manually): $p" >&2
    status=1
  fi
done
exit "$status"
