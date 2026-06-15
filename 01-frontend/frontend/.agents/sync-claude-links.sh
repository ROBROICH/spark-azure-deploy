#!/usr/bin/env bash
set -eu

usage() {
  cat <<'EOF'
Usage: ./.agents/sync-claude-links.sh

Creates project-local Claude symlinks from `./.agents` into `./.claude`:
- `./.claude/skills` -> `../.agents/skills`
- `./.claude/workflows` -> `../.agents/workflows` when present
- `./.claude/rules` -> `../.agents/rules`
- `./.claude/sources` -> `../.agents/sources` when present
- `./.claude/behavior` -> `../.agents/behavior`
- `./.claude/CODE-STANDARDS.md` -> `../.agents/CODE-STANDARDS.md`
EOF
}

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
AGENTS_DIR="$PROJECT_ROOT/.agents"
CLAUDE_DIR="$PROJECT_ROOT/.claude"

if [ ! -d "$AGENTS_DIR" ]; then
  printf 'Agents source directory not found: %s\n' "$AGENTS_DIR" >&2
  exit 1
fi

if [ "$#" -ne 0 ]; then
  usage >&2
  exit 1
fi

ensure_link() {
  link_path="$1"
  link_target="$2"

  mkdir -p "$(dirname -- "$link_path")"

  if [ -L "$link_path" ]; then
    if [ "$(readlink "$link_path")" = "$link_target" ]; then
      printf 'Already linked: %s -> %s\n' "$link_path" "$link_target"
      return 0
    fi

    printf 'Refusing to replace existing symlink with different target: %s\n' "$link_path" >&2
    exit 1
  fi

  if [ -e "$link_path" ]; then
    printf 'Refusing to replace existing path that is not a symlink: %s\n' "$link_path" >&2
    exit 1
  fi

  ln -s "$link_target" "$link_path"
  printf 'Linked: %s -> %s\n' "$link_path" "$link_target"
}

ensure_optional_dir_link() {
  link_path="$1"
  link_target="$2"
  source_path="$3"

  if [ ! -d "$source_path" ]; then
    printf 'Skipping missing optional directory: %s\n' "$source_path"
    return 0
  fi

  ensure_link "$link_path" "$link_target"
}

mkdir -p "$CLAUDE_DIR"

ensure_link "$CLAUDE_DIR/skills" "../.agents/skills"
ensure_optional_dir_link "$CLAUDE_DIR/workflows" "../.agents/workflows" "$AGENTS_DIR/workflows"
ensure_link "$CLAUDE_DIR/rules" "../.agents/rules"
ensure_optional_dir_link "$CLAUDE_DIR/sources" "../.agents/sources" "$AGENTS_DIR/sources"
ensure_link "$CLAUDE_DIR/behavior" "../.agents/behavior"
ensure_link "$CLAUDE_DIR/CODE-STANDARDS.md" "../.agents/CODE-STANDARDS.md"
