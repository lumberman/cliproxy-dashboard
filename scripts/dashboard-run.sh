#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
runtime_dir="$repo_dir/.dashboard-runtime"
command -v cli-proxy-api >/dev/null || { echo 'Install cli-proxy-api first.' >&2; exit 1; }
[[ -s "$repo_dir/dashboard/dist/index.html" ]] || { echo 'Build the dashboard first: cd dashboard && bun run build' >&2; exit 1; }
mkdir -p "$runtime_dir"
chmod 0700 "$runtime_dir"
python3 - "$runtime_dir" <<'PYCONFIG'
from pathlib import Path
import os
import secrets
import sys
root = Path(sys.argv[1])
config = root / 'config.yaml'
if not config.exists():
    key = secrets.token_urlsafe(32)
    client_key = secrets.token_urlsafe(32)
    text = f"""config-version: 8
server:
  host: "127.0.0.1"
  port: 8318
management:
  allow-remote: false
  secret-key: "{key}"
  disable-auto-update-panel: true
access:
  api-keys:
    - "{client_key}"
oauth:
  auth-dir: "{root / 'auths'}"
observability:
  usage:
    usage-statistics-enabled: true
"""
    for path, contents in ((config, text), (root / 'management-key', key + '\n')):
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write(contents)
PYCONFIG
bash "$repo_dir/scripts/dashboard-install.sh" --config "$runtime_dir/config.yaml" --force
printf 'Dashboard: http://127.0.0.1:8318/management.html#/quota\n'
printf 'Management key file: %s/management-key\n' "$runtime_dir"
printf 'This instance has its own config and provider credentials.\n'
cd -- "$runtime_dir"
exec cli-proxy-api --local-model --config "$runtime_dir/config.yaml"
