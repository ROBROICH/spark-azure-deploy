#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Discover all workspace modules dynamically (exclude root workspace)
ALL_MODULES=()
while IFS= read -r abs_path; do
  rel_path="${abs_path#"$REPO_ROOT/"}"
  [[ "$rel_path" != "$abs_path" && "$rel_path" != "" ]] && ALL_MODULES+=("$rel_path")
done < <(uv workspace list --paths)

# Parse flags
MODE="all"
INTEGRATION=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --changed)      MODE="changed"; shift ;;
    --pr)           MODE="pr"; shift ;;
    --integration)  INTEGRATION=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--changed | --pr] [--integration]"
      echo "  (no flag)       Run tests for all modules"
      echo "  --changed       Run tests only for modules with uncommitted changes (staged + unstaged)"
      echo "  --pr            Run tests only for modules changed compared to merge-base with dev"
      echo "  --integration   Also run integration tests (pytest -m integration)"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Filter modules based on mode
if [[ "$MODE" == "all" ]]; then
  MODULES=("${ALL_MODULES[@]}")
else
  if [[ "$MODE" == "changed" ]]; then
    changed_files=$({ git diff --name-only; git diff --name-only --cached; } | sort -u)
  else
    merge_base=$(git merge-base HEAD origin/dev)
    changed_files=$(git diff --name-only "$merge_base")
  fi

  MODULES=()
  for module in "${ALL_MODULES[@]}"; do
    if echo "$changed_files" | grep -q "^${module}/"; then
      MODULES+=("$module")
    fi
  done

  if [[ ${#MODULES[@]} -eq 0 ]]; then
    echo "No modules with changes detected (mode: --$MODE)."
    exit 0
  fi
fi

RESULTS_DIR=$(mktemp -d)
trap 'rm -rf "$RESULTS_DIR"' EXIT

parse_count() {
  local pattern="$1"
  local text="$2"
  local val
  val=$(echo "$text" | grep -oE "[0-9]+ $pattern" | grep -oE '[0-9]+') 2>/dev/null
  echo "${val:-0}"
}

run_test() {
  local module="$1"
  local slug="${module//\//_}"
  local outfile="$RESULTS_DIR/$slug"

  local output
  local exit_code=0
  local pytest_args=(-q)
  if (cd "$REPO_ROOT/$module" && uv run python -c 'import pytest_timeout' >/dev/null 2>&1); then
    pytest_args=(--timeout=20 "${pytest_args[@]}")
  fi
  if [[ "$INTEGRATION" == true ]]; then
    pytest_args+=(-m integration --no-cov)
  fi
  output=$(cd "$REPO_ROOT/$module" && uv run pytest "${pytest_args[@]}" 2>&1) || exit_code=$?

  local summary
  summary=$(echo "$output" | grep -E '(passed|failed|error|no tests|deselected)' | tail -1) || true

  local passed=$(parse_count "passed" "$summary")
  local failed=$(parse_count "failed" "$summary")
  local errors=$(parse_count "error" "$summary")
  local skipped=$(parse_count "skipped" "$summary")
  local deselected=$(parse_count "deselected" "$summary")
  local note=""

  local status="PASS"
  if [ "$failed" -gt 0 ] || [ "$errors" -gt 0 ] || { [ "$exit_code" -ne 0 ] && [ "$exit_code" -ne 5 ]; }; then
    status="FAIL"
  elif [ "$exit_code" -eq 5 ] || [ "$passed" -eq 0 ]; then
    status="NONE"
    note="no tests for $module add one"
  fi

  echo "$module|$status|$passed|$failed|$errors|$skipped|$note" > "$outfile"
}

echo "Running tests for ${#MODULES[@]} modules in parallel..."
echo ""

for module in "${MODULES[@]}"; do
  run_test "$module" &
done
wait

# Print table
printf "%-90s %-6s %7s %7s %7s %7s\n" "Module" "Status" "Passed" "Failed" "Errors" "Skipped"
printf "%-90s %-6s %7s %7s %7s %7s\n" "$(printf '%0.s-' {1..90})" "------" "-------" "-------" "-------" "-------"

total_passed=0 total_failed=0 total_errors=0 total_skipped=0

for module in "${MODULES[@]}"; do
  slug="${module//\//_}"
  IFS='|' read -r name status passed failed errors skipped note < "$RESULTS_DIR/$slug"
  printf "%-90s %-6s %7s %7s %7s %7s\n" "$name" "$status" "$passed" "$failed" "$errors" "$skipped"
  total_passed=$((total_passed + passed))
  total_failed=$((total_failed + failed))
  total_errors=$((total_errors + errors))
  total_skipped=$((total_skipped + skipped))
  if [ -n "$note" ]; then
    echo "$note"
  fi
done

printf "%-90s %-6s %7s %7s %7s %7s\n" "$(printf '%0.s-' {1..90})" "------" "-------" "-------" "-------" "-------"
printf "%-90s %-6s %7s %7s %7s %7s\n" "TOTAL" "" "$total_passed" "$total_failed" "$total_errors" "$total_skipped"
