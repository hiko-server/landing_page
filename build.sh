#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

command -v docker >/dev/null 2>&1 || {
  echo "docker is required to build the image." >&2
  exit 1
}

set -o allexport
source "${SCRIPT_DIR}/.docker_name"
set +o allexport

: "${IMAGE_NAME:?IMAGE_NAME is required in .docker_name}"

docker build -t "${IMAGE_NAME}-temp" .
