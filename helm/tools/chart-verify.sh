#!/usr/bin/env bash
# =============================================================================
# chart-verify.sh — lint, render and schema-validate every chart.
#
#   tools/chart-verify.sh [<chart-dir>...]      default: every charts/*/*
#
# Per chart, for the default values (when the chart is meant to render with
# them, see NEEDS_VALUES) and for each ci/*-values.yaml:
#   1. helm lint --strict
#   2. helm template | kubeconform -strict, core schemas plus the datreeio
#      CRD catalog (Gateway API, Envoy Gateway, ESO, KEDA, GMP, Istio, …);
#      kinds without any schema fail unless listed in SKIP_KINDS
#   3. helm unittest, when the chart has tests/
# Where the internal harness is present (scripts/render-envs.sh), spark-platform
# is additionally rendered with every tracked environment layering and
# validated the same way.
# Exit 0 = everything green.
# =============================================================================
set -uo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CRD_CATALOG='https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json'
# Kinds the catalog lacks (checked by the goldens/branch harness instead).
SKIP_KINDS=${SKIP_KINDS:-}
# Charts that intentionally refuse to render without environment input:
# their defaults are only linted; ci/ values carry the minimal input.
NEEDS_VALUES=" spark-platform gateway-routes redis "

WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
FAILS=0
ok()  { printf 'ok:   %s\n' "$*"; }
bad() { printf 'FAIL: %s\n' "$*"; FAILS=$((FAILS + 1)); }

kc() {  # <label> <file>
  local args=(-strict -summary -schema-location default -schema-location "$CRD_CATALOG")
  [ -n "$SKIP_KINDS" ] && args+=(-skip "$SKIP_KINDS")
  if out=$(kubeconform "${args[@]}" "$2" 2>&1); then ok "kubeconform $1: ${out##*Summary: }"
  else bad "kubeconform $1:"$'\n'"$(printf '%s\n' "$out" | grep -v '^Summary' | head -10)"; fi
}

check() {  # <chart-dir> <label> [values-file]
  local dir=$1 label=$2; shift 2
  local vals=(); [ $# -gt 0 ] && vals=(-f "$1")
  if out=$(helm lint --strict "$dir" "${vals[@]}" 2>&1); then ok "lint $label"
  else bad "lint $label:"$'\n'"$(printf '%s\n' "$out" | grep -E '\[(ERROR|WARNING)\]|Error' | head -5)"; fi
  if helm template x "$dir" -n default "${vals[@]}" > "$WORK/r.yaml" 2> "$WORK/err"; then kc "$label" "$WORK/r.yaml"
  else bad "template $label: $(head -3 "$WORK/err")"; fi
}

charts=("$@"); [ ${#charts[@]} -gt 0 ] || charts=("$ROOT"/charts/*/*/)
for dir in "${charts[@]}"; do
  dir=${dir%/}; [ -f "$dir/Chart.yaml" ] || continue
  name=$(basename "$dir")
  if [[ "$NEEDS_VALUES" == *" $name "* ]]; then
    if out=$(helm lint --strict "$dir" 2>&1); then ok "lint $name (defaults)"; else bad "lint $name (defaults): $(printf '%s\n' "$out" | grep -E 'ERROR' | head -3)"; fi
  else
    check "$dir" "$name (defaults)"
  fi
  for ci in "$dir"/ci/*-values.yaml; do
    [ -e "$ci" ] || continue
    check "$dir" "$name ($(basename "$ci" -values.yaml))" "$ci"
  done
  if [ -d "$dir/tests" ]; then
    if out=$(helm unittest "$dir" 2>&1); then ok "unittest $name: $(printf '%s\n' "$out" | grep -E '^Tests:' | tr -s ' ')"
    else bad "unittest $name:"$'\n'"$(printf '%s\n' "$out" | grep -E 'FAIL|Error|expected' | head -10)"; fi
  fi
done

if [ -x "$ROOT/scripts/render-envs.sh" ] && { [ $# -eq 0 ] || printf '%s\n' "$@" | grep -q spark-platform; }; then
  "$ROOT/scripts/render-envs.sh" "$WORK/envs" "$ROOT" >/dev/null
  for f in "$WORK"/envs/env-*.yaml; do
    if head -1 "$f" | grep -q '^# RENDER FAILED'; then bad "render $(basename "$f")"; else kc "$(basename "$f" .yaml)" "$f"; fi
  done
fi

echo; if [ "$FAILS" -eq 0 ]; then echo "RESULT: ALL GREEN"; else echo "RESULT: $FAILS FAILURE(S)"; fi
[ "$FAILS" -eq 0 ]
