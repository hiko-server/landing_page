#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

command -v docker >/dev/null 2>&1 || {
  echo "docker is required to rebuild the stack." >&2
  exit 1
}

set -o allexport
source "${SCRIPT_DIR}/.docker_name"
set +o allexport

: "${IMAGE_NAME:?IMAGE_NAME is required in .docker_name}"

docker build -t "${IMAGE_NAME}-temp" .
docker compose -f "${SCRIPT_DIR}/docker-compose.yml" down

if docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1; then
  docker tag "${IMAGE_NAME}" "${IMAGE_NAME}-old"
fi

docker tag "${IMAGE_NAME}-temp" "${IMAGE_NAME}"
docker compose -f "${SCRIPT_DIR}/docker-compose.yml" up -d

if docker image inspect "${IMAGE_NAME}-old" >/dev/null 2>&1; then
  docker rmi "${IMAGE_NAME}-old"
fi

if docker image inspect "${IMAGE_NAME}-temp" >/dev/null 2>&1; then
  docker rmi "${IMAGE_NAME}-temp"
fi

docker image prune --filter='dangling=true' -f
"${SCRIPT_DIR}/clean_image.sh"
df -h
