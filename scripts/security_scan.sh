#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

TRIVY_IGNORE_FILE="${TRIVY_IGNORE_FILE:-}"
TRIVY_IMAGE="${TRIVY_IMAGE:-aquasec/trivy:0.69.3}"
TRIVY_CACHE_VOLUME="${TRIVY_CACHE_VOLUME:-}"
BASE_REF="${BASE_REF:-origin/dev}"

MODE="all"
DRY_RUN=false

usage() {
  cat <<USAGE
Usage: $0 [--changed | --pr] [--dry-run]
  (no flag)   Scan built local images for uv workspace members with Dockerfiles
  --changed   Scan built local images for workspace members with staged or unstaged changes
  --pr        Scan built local images for workspace members changed compared to merge-base with ${BASE_REF}
  --dry-run   Print selected targets and expected local image names without scanning

Environment:
  TRIVY_IGNORE_FILE   Optional repo-local path to a Trivy ignore file. If unset, no --ignorefile is passed.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --changed) MODE="changed"; shift ;;
    --pr) MODE="pr"; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

require_command docker
require_command git
require_command jq
require_command sort
require_command uv

TRIVY_IGNORE_ARGS=()
if [[ -n "$TRIVY_IGNORE_FILE" ]]; then
  if [[ ! -f "$TRIVY_IGNORE_FILE" ]]; then
    echo "Configured Trivy ignorefile not found: $TRIVY_IGNORE_FILE" >&2
    exit 1
  fi

  trivy_ignore_abs_dir="$(cd "$(dirname "$TRIVY_IGNORE_FILE")" && pwd)"
  trivy_ignore_abs_path="$trivy_ignore_abs_dir/$(basename "$TRIVY_IGNORE_FILE")"

  if [[ "$trivy_ignore_abs_path" != "$REPO_ROOT/"* ]]; then
    echo "Configured Trivy ignorefile must be inside the repository so it is available in the Trivy container: $TRIVY_IGNORE_FILE" >&2
    exit 1
  fi

  TRIVY_IGNORE_ARGS=(--ignorefile "/work/${trivy_ignore_abs_path#"$REPO_ROOT/"}")
fi

ALL_MODULES=()
while IFS= read -r abs_path; do
  rel_path="${abs_path#"$REPO_ROOT/"}"
  if [[ "$rel_path" != "$abs_path" && "$rel_path" != "" && -f "$REPO_ROOT/$rel_path/Dockerfile" ]]; then
    ALL_MODULES+=("$rel_path")
  fi
done < <(uv workspace list --paths)

if [[ "${#ALL_MODULES[@]}" -eq 0 ]]; then
  echo "No uv workspace members with Dockerfiles found." >&2
  exit 1
fi

changed_files_for_mode() {
  case "$MODE" in
    all)
      return 0
      ;;
    changed)
      { git diff --name-only; git diff --name-only --cached; } | sort -u
      ;;
    pr)
      local merge_base
      merge_base="$(git merge-base HEAD "$BASE_REF")"
      git diff --name-only "$merge_base" | sort -u
      ;;
  esac
}

select_modules() {
  if [[ "$MODE" == "all" ]]; then
    printf '%s\n' "${ALL_MODULES[@]}" | sort -u
    return 0
  fi

  mapfile -t changed_files < <(changed_files_for_mode)
  if [[ "${#changed_files[@]}" -eq 0 ]]; then
    return 0
  fi

  local module file
  for module in "${ALL_MODULES[@]}"; do
    for file in "${changed_files[@]}"; do
      if [[ "$file" == "$module" || "$file" == "$module/"* ]]; then
        printf '%s\n' "$module"
        break
      fi
    done
  done | sort -u
}

image_tag_for_module() {
  local module="$1"
  printf 'test-%s:local' "${module//\//-}"
}

image_status() {
  local image="$1"
  if docker image inspect "$image" >/dev/null 2>&1; then
    printf 'FOUND'
  else
    printf 'MISSING'
  fi
}

scan_image() {
  local module="$1"
  local image="$2"
  local report="$3"

  if ! docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$CACHE_VOLUME:/root/.cache/trivy" \
    -v "$REPO_ROOT:/work:ro" \
    -v "$(dirname "$report"):/reports" \
    -w /work \
    "$TRIVY_IMAGE" image \
      --scanners vuln \
      --severity HIGH,CRITICAL \
      --format json \
      --output "/reports/$(basename "$report")" \
      "${TRIVY_IGNORE_ARGS[@]}" \
      --skip-version-check \
      --skip-files '**/*.so' \
      --skip-files '**/*.so.*' \
      --skip-files '**/*.cpp' \
      "$image" >/dev/null; then
    echo "" >&2
    echo "Trivy scan failed for $module ($image)." >&2
    printf 'SCAN_ERROR'
    return 0
  fi

  if [[ ! -s "$report" ]]; then
    echo "" >&2
    echo "Trivy scan did not produce a report for $module ($image)." >&2
    printf 'SCAN_ERROR'
    return 0
  fi

  local count
  count="$(jq -r '[.Results[]? | .Vulnerabilities // [] | length] | add // 0' "$report")"

  if [[ "$count" -gt 0 ]]; then
    echo "" >&2
    echo "HIGH/CRITICAL findings for $module ($image):" >&2
    jq -r '
      .Results[]?
      | select(.Vulnerabilities)
      | .Target as $target
      | .Vulnerabilities[]
      | "  - " + .Severity + " " + .VulnerabilityID + " " + .PkgName + " " + .InstalledVersion + " -> " + (.FixedVersion // "no fixed version") + " [" + $target + "]"
    ' "$report" >&2
  fi

  printf '%s' "$count"
}

mapfile -t MODULES < <(select_modules)

if [[ "${#MODULES[@]}" -eq 0 ]]; then
  echo "No Docker scan targets with changes detected (mode: --$MODE)."
  exit 0
fi

echo "Selected ${#MODULES[@]} Docker image target(s) for security scan (mode: $MODE):"
printf "%-90s %-8s %s\n" "Module" "Image" "Status"
printf "%-90s %-8s %s\n" "$(printf '%0.s-' {1..90})" "--------" "------"
for module in "${MODULES[@]}"; do
  image="$(image_tag_for_module "$module")"
  printf "%-90s %-8s %s\n" "$module" "$image" "$(image_status "$image")"
done
echo ""

if [[ "$DRY_RUN" == true ]]; then
  exit 0
fi

RESULTS_DIR="$(mktemp -d)"
if [[ -z "$TRIVY_CACHE_VOLUME" ]]; then
  CACHE_VOLUME="trivy-cache-local-$$-$RANDOM"
  REMOVE_CACHE_VOLUME=true
else
  CACHE_VOLUME="$TRIVY_CACHE_VOLUME"
  REMOVE_CACHE_VOLUME=false
fi
docker volume create "$CACHE_VOLUME" >/dev/null

cleanup() {
  rm -rf "$RESULTS_DIR"
  if [[ "$REMOVE_CACHE_VOLUME" == true ]]; then
    docker volume rm "$CACHE_VOLUME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

total_findings=0
missing_images=0
scan_errors=0

printf "%-90s %-8s %8s %s\n" "Module" "Status" "Findings" "Image"
printf "%-90s %-8s %8s %s\n" "$(printf '%0.s-' {1..90})" "--------" "--------" "-----"

for module in "${MODULES[@]}"; do
  image="$(image_tag_for_module "$module")"

  if ! docker image inspect "$image" >/dev/null 2>&1; then
    missing_images=$((missing_images + 1))
    printf "%-90s %-8s %8s %s\n" "$module" "MISSING" "-" "$image"
    continue
  fi

  report="$RESULTS_DIR/${module//\//_}.json"
  findings="$(scan_image "$module" "$image" "$report")"
  if [[ "$findings" == "SCAN_ERROR" ]]; then
    scan_errors=$((scan_errors + 1))
    printf "%-90s %-8s %8s %s\n" "$module" "ERROR" "-" "$image"
    continue
  fi

  total_findings=$((total_findings + findings))

  status="PASS"
  if [[ "$findings" -gt 0 ]]; then
    status="FAIL"
  fi

  printf "%-90s %-8s %8s %s\n" "$module" "$status" "$findings" "$image"
done

printf "%-90s %-8s %8s %s\n" "$(printf '%0.s-' {1..90})" "--------" "--------" "-----"
printf "%-90s %-8s %8s %s\n" "TOTAL" "" "$total_findings" "missing_images=$missing_images scan_errors=$scan_errors"

if [[ "$total_findings" -gt 0 || "$missing_images" -gt 0 || "$scan_errors" -gt 0 ]]; then
  exit 1
fi