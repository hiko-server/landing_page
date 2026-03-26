#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

command -v docker >/dev/null 2>&1 || {
  echo "docker is required to save the image tarball." >&2
  exit 1
}

set -o allexport
source "${SCRIPT_DIR}/.docker_name"
set +o allexport

: "${IMAGE_NAME:?IMAGE_NAME is required in .docker_name}"

if ! docker image inspect "${IMAGE_NAME}-temp" >/dev/null 2>&1; then
  echo "Image ${IMAGE_NAME}-temp does not exist. Run ./build.sh first." >&2
  exit 1
fi

docker save -o "${IMAGE_NAME}-temp.tar" "${IMAGE_NAME}-temp"
