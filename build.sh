#!/bin/bash


set -o allexport
source .docker_name
set +o allexport

docker build -t "${IMAGE_NAME}-temp" . 