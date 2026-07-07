#!/usr/bin/env bash
# Populate this deploy repo with the upstream openCode SPARK Workflow source, then
# apply the overlay files and patches. Run before `azd up` or image builds.
#
# Fetch-only: openCode is never written to. The fetched source is gitignored.
set -euo pipefail
REF="${1:-spark-workflow-0.2}"
UPSTREAM="${2:-https://gitlab.opencode.de/bmds/planungs-und-genehmigungsbeschleunigung/spark-workflow.git}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"

echo "Fetching openCode SPARK Workflow @ $REF (read-only)..."
git clone --depth 1 --branch "$REF" "$UPSTREAM" "$TMP"

echo "Merging upstream into repo root (delta files preserved)..."
( cd "$TMP" && find . -type f -not -path './.git/*' -not -path './.github/*' -print0 ) \
  | while IFS= read -r -d '' f; do
      rel="${f#./}"
      if [ ! -e "$ROOT/$rel" ]; then
        mkdir -p "$ROOT/$(dirname "$rel")"
        cp "$TMP/$rel" "$ROOT/$rel"
      fi
    done
rm -rf "$TMP"

echo "Applying overlay files..."
( cd "$ROOT/overlay" && find . -type f -print0 ) \
  | while IFS= read -r -d '' f; do
      rel="${f#./}"
      mkdir -p "$ROOT/$(dirname "$rel")"
      cp "$ROOT/overlay/$rel" "$ROOT/$rel"
    done

echo "Applying patches..."
"$ROOT/patches/apply-patches.sh"
echo "Upstream $REF fetched, overlaid and patched. Ready for build / azd up."
