#!/bin/sh
set -eu

cd "$CI_PROJECT_DIR"
: "${DEVGUARD_BUILD_MATERIALS:?Build materials must be configured}"
if [ ! -f "$DEVGUARD_BUILD_DOCKERFILE" ]; then
  echo "Missing build Dockerfile" >&2
  exit 1
fi
candidates=$(mktemp "$CI_PROJECT_DIR/.intoto-manifests.XXXXXX")
trap 'rm -f "$candidates"' EXIT HUP INT TERM
printf '%s\n' "$DEVGUARD_BUILD_DOCKERFILE" > "$candidates"
if [ -f "$DEVGUARD_BUILD_DOCKERFILE.dockerignore" ]; then
  printf '%s\n' "$DEVGUARD_BUILD_DOCKERFILE.dockerignore" >> "$candidates"
elif [ -f "$DEVGUARD_BUILD_CONTEXT/.dockerignore" ]; then
  printf '%s\n' "$DEVGUARD_BUILD_CONTEXT/.dockerignore" >> "$candidates"
fi

has_materials=false
while IFS= read -r material; do
  [ -n "$material" ] || continue
  printf '%s\n' "$material" >> "$candidates"
  has_materials=true
done <<EOF
$DEVGUARD_BUILD_MATERIALS
EOF
if [ "$has_materials" != true ]; then
  echo "Build materials must not be empty" >&2
  exit 1
fi

if [ "${DEVGUARD_BUILD_WORKSPACE_MANIFESTS:-false}" = true ]; then
  find . \( -name .git -o -name node_modules -o -name .venv -o -name venv -o -name __pycache__ \) -prune \
    -o -type f -name pyproject.toml -print >> "$candidates"
fi

materials=$(awk -v root="$CI_PROJECT_DIR" '
  {
    path = $0
    if (index(path, root "/") == 1) path = substr(path, length(root) + 2)
    if (substr(path, 1, 1) == "/") exit 1
    count = split(path, parts, "/")
    path = ""
    for (i = 1; i <= count; i++) {
      if (parts[i] == "..") exit 1
      if (parts[i] != "" && parts[i] != ".") path = path (path == "" ? "" : "/") parts[i]
    }
    if (path == "") exit 1
    if (!seen[path]++) paths[++total] = path
  }
  END {
    for (i = 1; i <= total; i++) print paths[i]
  }
' "$candidates") || { echo "Build materials must be scoped repository-relative paths" >&2; exit 1; }

while IFS= read -r material; do
  if [ ! -e "$material" ]; then
    echo "Missing build material: $material" >&2
    exit 1
  fi
done <<EOF
$materials
EOF

materials=$(printf '%s\n' "$materials" | awk '
  { paths[NR] = $0 }
  END {
    for (i = 1; i <= NR; i++) {
      covered = 0
      for (j = 1; j <= NR; j++) {
        if (i != j && index(paths[i], paths[j] "/") == 1) covered = 1
      }
      if (!covered) print paths[i]
    }
  }
')
while IFS= read -r material; do
  set -- "$@" "--materials=$material"
done <<EOF
$materials
EOF
rm -f "$candidates"
trap - EXIT HUP INT TERM

exec "$@" --ignore='.git/**/*' --ignore='**/node_modules/**' --ignore='**/.venv/**' \
  --ignore='**/__pycache__/**' --ignore='**/.pytest_cache/**' \
  --ignore='**/.mypy_cache/**' --ignore='**/.ruff_cache/**'
