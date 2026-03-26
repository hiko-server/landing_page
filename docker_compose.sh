#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

command -v docker >/dev/null 2>&1 || {
  echo "docker is required to run docker compose." >&2
  exit 1
}

docker compose -f "${SCRIPT_DIR}/docker-compose.yml" up -d --build
