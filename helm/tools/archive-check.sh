#!/usr/bin/env bash
# =============================================================================
# archive-check.sh — are the committed dependency archives up to date?
#
#   tools/archive-check.sh
#
# Every umbrella vendors its file:// dependencies as charts/*.tgz. For each
# umbrella this rebuilds the archives from source in a scratch copy of the
# tree (dependency order: layer umbrellas, spark-environment, spark-platform)
# and compares the unpacked contents with the committed archives, nested
# archives included. Archive bytes differ between builds (timestamps), so
# only file contents count. Remote dependencies (redis, temporal upstream)
# are compared as committed.
# Fix a failure with the helm dependency commands in README.md.
# =============================================================================
set -uo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
ORDER=(agent-services backend-services frontend-services spark-environment spark-platform)

cp -R "$ROOT/charts" "$WORK/charts"
for u in "${ORDER[@]}"; do
  helm dependency build "$WORK/charts/00-umbrella/$u" >/dev/null 2>&1 || { echo "FAIL: dependency build $u"; exit 1; }
done

unpack() {  # <dir with *.tgz> <out>: recursively unpack every archive
  mkdir -p "$2"
  for t in "$1"/*.tgz; do
    [ -e "$t" ] || continue
    local n; n=$(basename "$t" .tgz)
    mkdir -p "$2/$n"; tar xzf "$t" -C "$2/$n"
    while IFS= read -r -d '' nested; do
      local d="${nested%.tgz}.unpacked"; mkdir -p "$d"; tar xzf "$nested" -C "$d"; rm "$nested"
    done < <(find "$2/$n" -name '*.tgz' -print0)
  done
}

FAILS=0
for u in "${ORDER[@]}"; do
  unpack "$ROOT/charts/00-umbrella/$u/charts" "$WORK/committed/$u"
  unpack "$WORK/charts/00-umbrella/$u/charts" "$WORK/rebuilt/$u"
  if out=$(diff -r "$WORK/committed/$u" "$WORK/rebuilt/$u" 2>&1); then
    echo "ok:   $u archives match their sources"
  else
    echo "FAIL: $u archives are stale:"; printf '%s\n' "$out" | grep -E '^(Only in|diff -r)' | sed "s|$WORK/||g" | head -10
    FAILS=$((FAILS + 1))
  fi
done
[ "$FAILS" -eq 0 ]
