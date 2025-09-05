docker load -i xxx.tar
docker tag existing old
docker tmp existing
docker rmi tmp
docker rmi old
docker compose down
docker up -d
