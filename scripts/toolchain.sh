#!/usr/bin/env bash
set -euo pipefail

resolve_tool_root() {
  local skill_root="$1"
  local candidate common_git common_path common_root
  for candidate in "$skill_root/tools" "${SOFTWARE_DIAGRAMS_TOOLS:-}"; do
    if [[ -n "$candidate" && -f "$candidate/bin/plantuml.jar" ]]; then
      (cd "$candidate" && pwd)
      return 0
    fi
  done
  if common_git="$(git -C "$skill_root" rev-parse --git-common-dir 2>/dev/null)"; then
    if [[ "$common_git" = /* ]]; then common_path="$common_git"; else common_path="$skill_root/$common_git"; fi
    common_root="$(cd "$common_path" && pwd)"
    candidate="$(dirname "$common_root")/tools"
    if [[ -f "$candidate/bin/plantuml.jar" ]]; then
      (cd "$candidate" && pwd)
      return 0
    fi
  fi
  printf '%s/tools\n' "$skill_root"
}

require_file() {
  local path="$1" name="$2"
  [[ -f "$path" ]] || { echo "$name is missing: $path" >&2; return 1; }
}

assert_outputs() {
  local root="$1" output
  shift
  for output in "$@"; do
    [[ -s "$root/$output" ]] || { echo "Expected non-empty output was not created: $root/$output" >&2; return 1; }
  done
}
