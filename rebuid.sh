#!/bin/bash


set -o allexport
source .docker_name
set +o allexport

docker build -t "${IMAGE_NAME}-temp" . &&
docker compose down &&
docker tag  "${IMAGE_NAME}"  "${IMAGE_NAME}-old" &&
docker tag  "${IMAGE_NAME}-temp"  "${IMAGE_NAME}" &&
docker compose up -d &&
docker rmi  "${IMAGE_NAME}-old" &&
docker rmi  "${IMAGE_NAME}-temp" &&
docker image prune --filter='dangling=true' -f && 
./clean_image.sh && df -h