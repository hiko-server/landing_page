#!/usr/bin/env bash
# Container gate — run before pushing changes to the Dockerfile,
# docker-entrypoint.sh or the compose files (README → Quality gates).
#
#   scripts/check-container.sh [--no-e2e]
#
# Needs Docker (with compose), jq, curl and the dev dependencies (`yarn
# install`, for Playwright). PORT (default 3000) is the loopback port the
# container is published on.
#
#   1. compose    docker-compose.yml alone and merged with the override example
#                 publish loopback only (the site on 127.0.0.1:3002), log with
#                 the `local` driver, keep the runtime hardening and the
#                 static-archive volume (earlier builds' /_next/static)
#   2. build      the image the server builds (no data/content.db in the
#                 context, public identifiers as build args)
#   3. start      fresh data/ + uploads directories holding only the git seeds,
#                 no R2, the same restrictions as docker-compose.yml, and a
#                 throwaway admin generated for this run
#   4. smoke      /api/health and key pages answer 200, warm-isr regenerates,
#                 non-root user, no capabilities, NoNewPrivs, content.db built
#                 from the seeds, /_next/image answers 404
#   5. e2e        the Playwright + axe suite against that container, in the
#                 engines that run on macOS and Linux alike: Chromium (desktop,
#                 tablet, phone, reduced motion) and WebKit (iPhone), then the
#                 @admin specs (skipped with --no-e2e). Firefox and the visual
#                 baselines run in the pinned Linux image
#                 (scripts/check-fixture-gates.sh)
#   6. stop       SIGTERM reaches the server: the container stops in < 8 s
#
# The container, image tag and scratch directory are removed on exit; the
# checkout's own data/, public/uploads and .env are never mounted.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

RUN_E2E=1
case "${1:-}" in
  '') ;;
  --no-e2e) RUN_E2E=0 ;;
  *) echo "usage: scripts/check-container.sh [--no-e2e]" >&2; exit 2 ;;
esac

PORT="${PORT:-3000}"
BASE="http://127.0.0.1:$PORT"
IMAGE=landing-page:check
NAME="landing-page-check-$$"

for cmd in docker jq curl node; do
  command -v "$cmd" >/dev/null || { echo "check-container: $cmd not found" >&2; exit 1; }
done
docker info >/dev/null 2>&1 || { echo "check-container: the Docker daemon is not running" >&2; exit 1; }

# Inside the checkout so Docker Desktop / colima can bind-mount it (they share
# the home directory, not every temp dir); .gitignore and .dockerignore skip it.
WORK="$(mktemp -d "$PWD/.container-check.XXXXXX")"
CREATED_ENV=0
cleanup() {
  status=$?
  if [ "$status" -ne 0 ] && docker inspect "$NAME" >/dev/null 2>&1; then
    echo "--- container logs"
    docker logs "$NAME" 2>&1 | tail -n 80 || true
  fi
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker image rm "$IMAGE" >/dev/null 2>&1 || true
  [ "$CREATED_ENV" = 1 ] && rm -f .env
  rm -rf "$WORK" 2>/dev/null || echo "check-container: could not remove $WORK (files owned by the container user)" >&2
  exit "$status"
}
trap cleanup EXIT

step() { printf '\n==> %s\n' "$*"; }

step "compose: loopback only, logging, hardening"
# The service reads env_file .env: an empty one stands in when there is none.
if [ ! -e .env ]; then
  : >.env
  CREATED_ENV=1
fi
docker compose -f docker-compose.yml config --format json >"$WORK/base.json"
docker compose -f docker-compose.yml -f docker-compose.override.example.yml config --format json >"$WORK/merged.json"
for f in base merged; do
  jq -e '[.services[].ports[]?] | length > 0 and all(.host_ip == "127.0.0.1")' "$WORK/$f.json" >/dev/null
  jq -e '.services["landing-page"] | (.cap_drop == ["ALL"]) and ((.security_opt // []) | index("no-new-privileges:true") != null) and (.pids_limit > 0 and .pids_limit <= 512)' "$WORK/$f.json" >/dev/null
done
jq -e '[.services[].ports[]?] | length == 1' "$WORK/merged.json" >/dev/null
jq -e '[.services[].ports[]? | select((.published | tostring) == "3002" and .target == 3000)] | length == 1' "$WORK/merged.json" >/dev/null
jq -e '.services["landing-page"].logging.driver == "local"' "$WORK/merged.json" >/dev/null
# Earlier builds' /_next/static files survive a deploy (scripts/static-archive.mjs): the
# named volume must be there alone and merged with the override (no `!override` on volumes).
for f in base merged; do
  jq -e '[.services["landing-page"].volumes[] | select(.target == "/app/next-static-archive" and .type == "volume")] | length == 1' "$WORK/$f.json" >/dev/null
done
# The merged config carries .env's values: keep it no longer than needed.
rm -f "$WORK/base.json" "$WORK/merged.json"
if [ "$CREATED_ENV" = 1 ]; then
  rm -f .env
  CREATED_ENV=0
fi
echo "ok"

step "build $IMAGE"
DOCKER_BUILDKIT=1 docker build \
  --build-arg NEXT_PUBLIC_SITE_HOST=example.com \
  --build-arg NEXT_PUBLIC_PRODUCT_NAME=PortfolioStudio \
  --build-arg NEXT_PUBLIC_BUILD_SHA="$(git rev-parse --short=7 HEAD)" \
  -t "$IMAGE" .

step "start on $BASE (fresh data with the git seeds, no R2)"
ADMIN_EMAIL=check@example.com
ADMIN_PASS="$(node -e 'process.stdout.write(require("crypto").randomBytes(18).toString("base64url"))')"
JWT_SECRET="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))')"
export ADMIN_EMAIL ADMIN_PASS
mkdir -p "$WORK/data" "$WORK/uploads" "$WORK/static-archive"
cp data/home.json data/cvdata.json "$WORK/data/"
git ls-files -z public/uploads | xargs -0 -I{} cp {} "$WORK/uploads/"
chmod 0777 "$WORK/data" "$WORK/uploads" "$WORK/static-archive"
chmod 0666 "$WORK"/data/*.json
find "$WORK/uploads" -type f -exec chmod 0666 {} +
docker run -d --name "$NAME" -p "127.0.0.1:$PORT:3000" \
  --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 256 \
  -e NODE_ENV=production \
  -e JWT_SECRET="$JWT_SECRET" \
  -e ADMIN_EMAIL \
  -e ADMIN_PASS \
  -e SITE_URL="$BASE" \
  -v "$WORK/data:/app/data" \
  -v "$WORK/uploads:/app/public/uploads" \
  -v "$WORK/static-archive:/app/next-static-archive" \
  "$IMAGE" >/dev/null

step "smoke"
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "$BASE/api/health"; then break; fi
  if [ "$(docker inspect -f '{{.State.Running}}' "$NAME")" != "true" ]; then
    echo "container exited" >&2
    exit 1
  fi
  sleep 2
done
echo "health: $(curl -fsS "$BASE/api/health")"
for path in /api/health /blog /work /now /uses; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$path")
  echo "$path → $code"
  test "$code" = 200
done
# warm-isr must find /app/.next/prerender-manifest.json and refresh the
# build-time pages once the server is healthy.
for _ in $(seq 1 30); do
  if docker logs "$NAME" 2>&1 | grep -q '\[warm-isr\] regenerated'; then break; fi
  sleep 2
done
docker logs "$NAME" 2>&1 | grep '\[warm-isr\] regenerated'
# Runs as the image's non-root user and could write the mounted data dir…
test "$(docker exec "$NAME" id -u)" = 1001
# …with no capabilities and no way to gain any.
docker exec "$NAME" sh -c 'grep -E "^Cap(Eff|Bnd):" /proc/1/status'
test "$(docker exec "$NAME" sh -c 'grep "^CapBnd:" /proc/self/status | tr -d "[:space:]" | cut -d: -f2')" = 0000000000000000
test "$(docker exec "$NAME" sh -c 'grep "^NoNewPrivs:" /proc/self/status | tr -d "[:space:]" | cut -d: -f2')" = 1
test -f "$WORK/data/content.db"
# The image optimizer is disabled (GHSA-2xp9-vwfh-vxw4): 404, never a resize.
test "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/_next/image?url=%2Ffavicon.ico&w=64&q=75")" = 404
echo "ok"

if [ "$RUN_E2E" = 1 ]; then
  step "e2e (Playwright + axe: Chromium, WebKit, then @admin)"
  # An explicit project list: the config's firefox and visual projects belong
  # to scripts/check-fixture-gates.sh (Linux image; Firefox does not start on
  # every macOS host), and the admin project would otherwise wait for them.
  npx playwright install chromium webkit
  E2E_BASE_URL="$BASE" yarn -s e2e --project=chromium --project=tablet --project=mobile --project=reduced --project=webkit
  E2E_BASE_URL="$BASE" yarn -s e2e --project=admin --no-deps
fi

step "graceful stop"
# dumb-init must forward SIGTERM to the server: stopping has to finish well
# before docker's 10 s SIGKILL fallback.
start=$(date +%s)
docker stop -t 10 "$NAME" >/dev/null
elapsed=$(($(date +%s) - start))
echo "stopped in ${elapsed}s"
test "$elapsed" -lt 8

step "container gate passed"
