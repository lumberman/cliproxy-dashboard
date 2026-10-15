#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
source_file=""
config_path="$repo_dir/config.yaml"
output=""
force=false

usage() {
  cat <<'HELP'
Usage: scripts/dashboard-install.sh [options]

Install the built dashboard as management.html.

  --source FILE   Use this HTML file (default: dashboard/dist/index.html,
                  then dashboard/dist/management.html).
  --config PATH   Use the server config path to locate static/management.html.
  --output FILE   Use this destination file instead of the server path rules.
  --force         Replace an existing file with different contents.
  --help          Show this help.

The script honors MANAGEMENT_STATIC_PATH, WRITABLE_PATH, and writable_path.
Set management.disable-auto-update-panel: true before the server starts.
The script does not change the server config or build the dashboard.
HELP
}

fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

while (($#)); do
  case "$1" in
    --source|--config|--output)
      (($# >= 2)) && [[ -n "$2" ]] || fail "$1 requires a path"
      case "$1" in
        --source) source_file="$2" ;;
        --config) config_path="$2" ;;
        --output) output="$2" ;;
      esac
      shift 2
      ;;
    --force) force=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

if [[ -z "$source_file" ]]; then
  source_file="$repo_dir/dashboard/dist/index.html"
  if [[ ! -f "$source_file" ]]; then
    source_file="$repo_dir/dashboard/dist/management.html"
  fi
fi
[[ -f "$source_file" && -s "$source_file" ]] || fail "Build the dashboard first, or supply a nonempty HTML file with --source"

if [[ -z "$output" ]]; then
  static_path=$(trim "${MANAGEMENT_STATIC_PATH:-}")
  writable_root=$(trim "${WRITABLE_PATH:-}")
  [[ -n "$writable_root" ]] || writable_root=$(trim "${writable_path:-}")
  if [[ -n "$static_path" ]]; then
    # The backend accepts either a directory or the management.html path.
    static_path="${static_path%/}"
    if [[ "${static_path##*/}" == [mM][aA][nN][aA][gG][eE][mM][eE][nN][tT].[hH][tT][mM][lL] ]]; then
      output="$static_path"
    else
      output="${static_path:-/}/management.html"
    fi
  elif [[ -n "$writable_root" ]]; then
    output="$writable_root/static/management.html"
  elif [[ -d "$config_path" ]]; then
    output="$config_path/static/management.html"
  else
    output="$(dirname -- "$config_path")/static/management.html"
  fi
fi

[[ ! -d "$output" ]] || fail "The destination is a directory: $output"
if [[ -e "$output" || -L "$output" ]]; then
  if cmp -s -- "$source_file" "$output"; then
    printf 'Dashboard already installed: %s\n' "$output"
    exit 0
  fi
  "$force" || fail "The destination exists; use --force to replace it: $output"
fi

output_dir=$(dirname -- "$output")
mkdir -p -- "$output_dir"
temporary_file=$(mktemp "$output_dir/.management.html.XXXXXX")
trap 'rm -f -- "$temporary_file"' EXIT
cp -- "$source_file" "$temporary_file"
chmod 0644 "$temporary_file"
mv -f -- "$temporary_file" "$output"
printf 'Dashboard installed: %s\n' "$output"
printf 'Set management.disable-auto-update-panel: true to retain this dashboard.\n'
