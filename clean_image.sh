#!/usr/bin/env bash

set -euo pipefail

command -v docker >/dev/null 2>&1 || {
  echo "docker is required to prune images." >&2
  exit 1
}

docker builder prune --all -f
docker image prune --filter='dangling=true' -f
