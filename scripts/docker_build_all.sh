#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

export GOOGLE_AUTH_TOKEN="${GOOGLE_AUTH_TOKEN:-$(gcloud auth print-access-token)}"

DOCKERFILES=()

if [ "$#" -gt 0 ]; then
  DOCKERFILES=("$@")
else
  while IFS= read -r abs_path; do
    rel_path="${abs_path#"$REPO_ROOT/"}"
    if [[ "$rel_path" != "$abs_path" && "$rel_path" != "" && -f "$REPO_ROOT/$rel_path/Dockerfile" ]]; then
      DOCKERFILES+=("$rel_path/Dockerfile")
    fi
  done < <(uv workspace list --paths)
fi

failed=()

for df in "${DOCKERFILES[@]}"; do
  name=$(echo "$df" | sed 's|/Dockerfile$||; s|/|-|g')
  tag="test-${name}:local"
  echo "=========================================="
  echo "Building: $df"
  echo "Tag:      $tag"
  echo "=========================================="
  if docker buildx build \
    --secret id=google_auth_token,env=GOOGLE_AUTH_TOKEN \
    -t "$tag" \
    -f "$df" \
    .; then
    echo "OK: $df"
  else
    echo "FAILED: $df"
    failed+=("$df")
  fi
  echo ""
done

echo "=========================================="
if [ ${#failed[@]} -eq 0 ]; then
  echo "All ${#DOCKERFILES[@]} builds succeeded."
else
  echo "${#failed[@]} of ${#DOCKERFILES[@]} builds FAILED:"
  for f in "${failed[@]}"; do
    echo "  - $f"
  done
  exit 1
fi
