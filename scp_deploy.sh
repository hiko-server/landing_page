#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

command -v scp >/dev/null 2>&1 || {
  echo "scp is required to upload the image tarball." >&2
  exit 1
}

set -o allexport
source "${SCRIPT_DIR}/.docker_name"
set +o allexport

: "${IMAGE_NAME:?IMAGE_NAME is required in .docker_name}"

DEPLOY_HOST="${DEPLOY_HOST:-hiko@172.105.125.253}"
DEPLOY_PATH="${DEPLOY_PATH:-~/docker-prod/easily_cv/easilycv_frontend}"
TAR_FILE="${IMAGE_NAME}-temp.tar"

if [[ ! -f "${TAR_FILE}" ]]; then
  echo "Missing ${TAR_FILE}. Run ./save.sh before uploading." >&2
  exit 1
fi

scp "${TAR_FILE}" "${DEPLOY_HOST}:${DEPLOY_PATH}/${TAR_FILE}"
