source .docker_name

scp "$IMAGE_NAME"-temp.tar hiko@172.105.125.253:~/docker-prod/easily_cv/easilycv_frontend/"$IMAGE_NAME"-temp.tar

docker compose down
docker tag "$IMAGE_NAME" "$IMAGE_NAME"-old
docker tag "$IMAGE_NAME"-temp "$IMAGE_NAME"
docker compose up -d 
docker rmi "$IMAGE_NAME"-old
docker rmi "$IMAGE_NAME"-temp
docker image prune --filter='dangling=true' -f