#!/usr/bin/env bash
# Deploy main to production (vultr_tokyo) — the only supported deploy path.
#
#   scripts/deploy.sh [--force]
#
# Runs on the developer machine and drives the server over `ssh vultr_tokyo`
# (host alias from ~/.ssh/config). The server has no GitHub credentials, so
# the new commits travel as a git bundle:
#
#   1. preflight  clean tree, on main, main == origin/main, server reachable,
#                 server HEAD is an ancestor of main (fast-forward only)
#   2. prepare    online SQLite backup through the running container
#                 (better-sqlite3 .backup()), tar of data/ + public/uploads/,
#                 copies of .env and docker-compose.override.yml, all under
#                 /root/landing_page-backups/<ts>/; `docker tag <image>:latest
#                 <image>:pre-<ts>`; fast-forward the checkout from the bundle
#                 while keeping the server's own data/home.json and
#                 docker-compose.override.yml byte-for-byte
#   3. build      `docker compose build` (the old container keeps serving)
#   4. activate   `docker compose up -d --no-build`, wait for `healthy` and the
#                 `[warm-isr] regenerated` log line, /api/health status "ok",
#                 port published on 127.0.0.1 only
#   5. smoke      key URLs through https://lucian-dev.com
#   6. finalize   .deployed-sha, prune old images
#
# Any failure after the image switch rolls back automatically:
# `docker tag <image>:pre-<ts> <image>:latest && docker compose up -d
# --no-build`, plus the checkout reset to the previous commit. A failed build
# only resets the checkout (the old container never stopped). The backup
# paths are printed either way.
#
# Overrides (environment): DEPLOY_HOST (vultr_tokyo), DEPLOY_DIR
# (/root/repo/landing_page), DEPLOY_SITE_URL (https://lucian-dev.com).
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-vultr_tokyo}"
DEPLOY_DIR="${DEPLOY_DIR:-/root/repo/landing_page}"
DEPLOY_SITE_URL="${DEPLOY_SITE_URL:-https://lucian-dev.com}"
BRANCH=main
FORCE=0

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h | --help)
      sed -n '2,/^set -euo/p' "$0" | sed -e '$d' -e 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown argument: $arg (see --help)" >&2
      exit 2
      ;;
  esac
done

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
log() { printf '\033[1m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[deploy] %s\033[0m\n' "$*" >&2; }
die() {
  printf '\033[31m[deploy] %s\033[0m\n' "$*" >&2
  exit 1
}

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=6)
# Arguments are joined into one remote command line: only pass values without
# spaces or shell metacharacters (paths, hashes, timestamps, modes).
# shellcheck disable=SC2029
remote() { ssh "${SSH_OPTS[@]}" "$DEPLOY_HOST" "$@"; }

# ── Remote half (runs on the server as root, bash ≥ 4) ─────────────────────
remote_script() {
  cat <<'REMOTE'
#!/usr/bin/env bash
set -euo pipefail
MODE="$1"; TS="$2"; DIR="$3"; SERVER_HEAD="$4"; TARGET="${5:-}"
IMAGE=hiko-landing-page-frontend-ts-staging
CONTAINER=hiko-landing-page-frontend-ts-staging
BACKUP_ROOT=/root/landing_page-backups
B="$BACKUP_ROOT/$TS"
LOCK=/tmp/landing_page-deploy.lock
BUNDLE="/tmp/landing_page-deploy-$TS.bundle"
PRESERVE=(data/home.json docker-compose.override.yml)
G() { git -c "safe.directory=$DIR" -C "$DIR" "$@"; }
say() { printf '  [server] %s\n' "$*"; }
fail() { printf '  [server] ERROR: %s\n' "$*" >&2; exit 1; }
running() { [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)" = true ]; }

preserve_key() { printf '%s' "$1" | tr '/' '_'; }
restore_preserved() {
  for f in "${PRESERVE[@]}"; do
    local saved
    saved="$B/preserve/$(preserve_key "$f")"
    if [ -f "$saved" ]; then cp -p "$saved" "$DIR/$f"; fi
  done
}
# Put the checkout back on the previous commit, then the server-local files.
restore_checkout() {
  if [ "$(G rev-parse HEAD)" != "$SERVER_HEAD" ]; then
    G reset --hard --quiet "$SERVER_HEAD"
    say "checkout reset to ${SERVER_HEAD:0:7}"
  fi
  restore_preserved
}
unlock() { rm -rf "$LOCK"; }
# EXIT traps: undo only when the mode fails.
unlock_on_failure() { local rc=$?; [ $rc -eq 0 ] || unlock; }
restore_on_failure() { local rc=$?; [ $rc -eq 0 ] || { restore_checkout; unlock; }; }

wait_ready() { # $1 = since (RFC 3339), $2 = timeout seconds
  local since="$1" deadline=$((SECONDS + $2)) state health warmed=0
  while [ $SECONDS -lt $deadline ]; do
    state=$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo missing)
    health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$CONTAINER" 2>/dev/null || true)
    case "$state" in exited | dead | missing) say "container is $state"; return 1 ;; esac
    [ "$health" = unhealthy ] && { say "container is unhealthy"; return 1; }
    if [ $warmed -eq 0 ] && docker logs --since "$since" "$CONTAINER" 2>&1 | grep -q '\[warm-isr\] regenerated'; then
      warmed=1
      say "$(docker logs --since "$since" "$CONTAINER" 2>&1 | grep '\[warm-isr\] regenerated' | tail -n 1 | cut -c1-220)"
    fi
    if [ "$health" = healthy ] && [ $warmed -eq 1 ]; then return 0; fi
    sleep 3
  done
  say "timed out (health: ${health:-none}, warm-up logged: $([ $warmed -eq 1 ] && echo yes || echo no))"
  return 1
}

case "$MODE" in
  prepare)
    mkdir "$LOCK" 2>/dev/null || fail "another deploy holds $LOCK (started $(cat "$LOCK/ts" 2>/dev/null || echo '?')); remove it if that deploy is dead"
    echo "$TS" > "$LOCK/ts"
    trap unlock_on_failure EXIT
    [ "$(G rev-parse HEAD)" = "$SERVER_HEAD" ] || fail "server HEAD moved since preflight"

    # Server-local edits other than the two known files mean drift: stop.
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      case "$f" in data/home.json | docker-compose.override.yml) ;; *) fail "unexpected local modification on the server: $f (resolve it by hand)" ;; esac
    done < <(G diff --name-only HEAD)

    mkdir -p "$B/preserve"
    chmod 700 "$BACKUP_ROOT" "$B"
    df -Pk "$DIR" | awk 'NR==2 && $4 < 3145728 { print "  [server] WARNING: less than 3 GB free on " $6 }'

    # 1. Online backup of the live SQLite files, consistent even mid-write.
    if running; then
      for db in content.db analytics.db; do
        docker exec "$CONTAINER" test -f "/app/data/$db" || continue
        docker exec "$CONTAINER" node -e '
          const Database = require("better-sqlite3")
          const [src, dst] = process.argv.slice(1)
          const db = new Database(src, { fileMustExist: true, timeout: 10000 })
          db.backup(dst).then(() => db.close()).catch((e) => { console.error(e.message); process.exit(1) })
        ' "/app/data/$db" "/tmp/deploy-$TS-$db"
        docker cp "$CONTAINER:/tmp/deploy-$TS-$db" "$B/$db"
        docker exec "$CONTAINER" rm -f "/tmp/deploy-$TS-$db"
        say "online backup: $B/$db ($(du -h "$B/$db" | cut -f1))"
      done
    else
      say "container not running: skipping the online SQLite backup (the tar below is consistent)"
    fi

    # 2. Files: data/ (minus its own snapshot archives) and uploads. The live
    # container keeps writing data/analytics.db-wal; GNU tar then exits 1
    # ("file changed as we read it"). That is expected here (step 1 already
    # holds consistent copies of both databases), so only exit codes above 1
    # fail the deploy.
    tar --warning=no-file-changed -czf "$B/data-uploads.tgz" -C "$DIR" --exclude=data/backups data public/uploads || [ $? -eq 1 ]
    say "files: $B/data-uploads.tgz ($(du -h "$B/data-uploads.tgz" | cut -f1))"
    [ -f "$DIR/.env" ] && cp -p "$DIR/.env" "$B/.env"
    for f in "${PRESERVE[@]}"; do
      [ -f "$DIR/$f" ] && cp -p "$DIR/$f" "$B/preserve/$(preserve_key "$f")"
    done
    [ -f "$DIR/docker-compose.override.yml" ] || say "WARNING: no docker-compose.override.yml — copy docker-compose.override.example.yml"

    # 3. Rollback image.
    if docker image inspect "$IMAGE:latest" >/dev/null 2>&1; then
      docker tag "$IMAGE:latest" "$IMAGE:pre-$TS"
      say "rollback image: $IMAGE:pre-$TS"
    else
      say "WARNING: no $IMAGE:latest image — automatic rollback will not be possible"
    fi

    # 4. Fast-forward from the bundle, keeping the server-local files.
    if [ "$TARGET" != "$SERVER_HEAD" ]; then
      G bundle verify -q "$BUNDLE" >/dev/null
      G fetch --quiet "$BUNDLE" "refs/heads/main"
      [ "$(G rev-parse FETCH_HEAD)" = "$TARGET" ] || fail "bundle does not contain $TARGET"
      trap restore_on_failure EXIT
      incoming=$(G diff --name-only HEAD "$TARGET")
      # A local edit to a file the new commits touch (or delete) blocks the
      # fast-forward: discard it here; the saved copy goes back right after.
      while IFS= read -r f; do
        [ -z "$f" ] && continue
        if grep -qxF "$f" <<<"$incoming"; then G checkout -- "$f"; fi
      done < <(G diff --name-only HEAD)
      G merge --ff-only --quiet "$TARGET"
      restore_preserved
      say "checkout: ${SERVER_HEAD:0:7} → ${TARGET:0:7}"
    fi
    ;;

  build)
    trap restore_on_failure EXIT
    cd "$DIR"
    export NEXT_PUBLIC_BUILD_SHA DOCKER_BUILDKIT=1
    NEXT_PUBLIC_BUILD_SHA=$(G rev-parse --short HEAD)
    docker compose build
    # If the deploying ssh session died mid-build, the local side has already
    # aborted (checkout restored, lock released) while this build ran on. Do
    # not leave an image that was never activated as :latest: the next deploy
    # would keep it as its rollback image. Leave a newer deploy's lock alone.
    if [ "$(cat "$LOCK/ts" 2>/dev/null || true)" != "$TS" ]; then
      trap - EXIT
      if docker image inspect "$IMAGE:pre-$TS" >/dev/null 2>&1; then docker tag "$IMAGE:pre-$TS" "$IMAGE:latest"; fi
      fail "this deploy was aborted while it was building; the new image was discarded"
    fi
    say "built $IMAGE:latest ($NEXT_PUBLIC_BUILD_SHA)"
    ;;

  activate)
    cd "$DIR"
    since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    # --force-recreate: with an unchanged image (--force on the same commit)
    # compose would keep the old container, which never logs the warm-up line
    # again, so wait_ready would time out and trigger a pointless rollback.
    docker compose up -d --no-build --force-recreate
    wait_ready "$since" 300 || exit 1
    bindings=$(docker port "$CONTAINER" 3000/tcp || true)
    [ -n "$bindings" ] || { say "no published port"; exit 1; }
    if grep -vq '^127\.0\.0\.1:' <<<"$bindings"; then
      printf '  [server] SECURITY: port 3000 is published beyond loopback:\n%s\n' "$bindings" >&2
      unlock
      exit 3
    fi
    addr=$(head -n 1 <<<"$bindings")
    body=$(curl -fsS --max-time 10 "http://$addr/api/health") || { say "health endpoint unreachable on $addr"; exit 1; }
    grep -q '"status":"ok"' <<<"$body" || { say "health is not ok: $body"; exit 1; }
    say "healthy on $addr"
    ;;

  rollback)
    say "last 100 log lines of the failed container:"
    docker logs --tail 100 "$CONTAINER" 2>&1 | sed 's/^/    /' || true
    restore_checkout
    cd "$DIR"
    if docker image inspect "$IMAGE:pre-$TS" >/dev/null 2>&1; then
      docker tag "$IMAGE:pre-$TS" "$IMAGE:latest"
      since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
      docker compose up -d --no-build --force-recreate
      if wait_ready "$since" 240; then say "rolled back to $IMAGE:pre-$TS — serving again"; else say "rolled back, but the previous image is not healthy either: check now"; fi
    else
      say "no $IMAGE:pre-$TS image to roll back to"
    fi
    unlock
    ;;

  abort) # failure before the image switch: the old container still serves
    restore_checkout
    # The build may have finished before the connection dropped: put the image
    # the running container uses back on :latest.
    if docker image inspect "$IMAGE:pre-$TS" >/dev/null 2>&1; then docker tag "$IMAGE:pre-$TS" "$IMAGE:latest"; fi
    unlock
    ;;

  finalize)
    cd "$DIR"
    echo "$TARGET" > .deployed-sha
    docker image prune -f --filter until=168h >/dev/null
    # Keep the three most recent rollback images this script created
    # (pre-<UTC timestamp>, which sort chronologically). Hand-made tags such
    # as pre-v2-… are never touched.
    docker image ls "$IMAGE" --format '{{.Tag}}' | grep -E '^pre-[0-9]{8}T[0-9]{6}Z$' | sort -r | tail -n +4 | while read -r tag; do
      docker rmi "$IMAGE:$tag" >/dev/null && say "removed old rollback image $IMAGE:$tag"
    done
    rm -f "$BUNDLE" "/tmp/landing_page-deploy-$TS.sh"
    unlock
    ;;

  *) fail "unknown mode $MODE" ;;
esac
REMOTE
}

# ── 1. Preflight (local) ───────────────────────────────────────────────────
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
[ "$(git symbolic-ref --quiet --short HEAD || true)" = "$BRANCH" ] || die "check out $BRANCH first"
[ -z "$(git status --porcelain --untracked-files=no)" ] || die "working tree has uncommitted changes"
git fetch --quiet origin "$BRANCH"
TARGET=$(git rev-parse "$BRANCH")
[ "$TARGET" = "$(git rev-parse "origin/$BRANCH")" ] || die "$BRANCH is not origin/$BRANCH — push (or pull) first; CI must be green on what you deploy"
SHORT=$(git rev-parse --short "$TARGET")

remote true || die "cannot reach $DEPLOY_HOST over ssh"
SERVER_HEAD=$(remote "git -c safe.directory=$(printf %q "$DEPLOY_DIR") -C $(printf %q "$DEPLOY_DIR") rev-parse HEAD")
if [ "$SERVER_HEAD" = "$TARGET" ] && [ $FORCE -eq 0 ]; then
  log "server already runs $SHORT (use --force to rebuild it)"
  exit 0
fi
git cat-file -e "$SERVER_HEAD^{commit}" 2>/dev/null || die "server HEAD $SERVER_HEAD is not in the local repository"
git merge-base --is-ancestor "$SERVER_HEAD" "$TARGET" || die "server HEAD ${SERVER_HEAD:0:7} is not an ancestor of $BRANCH — refusing a non-fast-forward deploy"

TS=$(date -u +%Y%m%dT%H%M%SZ)
WORK=$(mktemp -d)
PHASE=init
cleanup() {
  local code=$?
  rm -rf "$WORK"
  if [ $code -ne 0 ]; then
    case "$PHASE" in
      # Interrupted between the backup and the switch: restore the checkout.
      prepared | built) remote bash "/tmp/landing_page-deploy-$TS.sh" abort "$TS" "$DEPLOY_DIR" "$SERVER_HEAD" || true ;;
      # Interrupted while the new container was starting or being checked.
      activating | smoke)
        warn "interrupted after the switch — rolling back"
        remote bash "/tmp/landing_page-deploy-$TS.sh" rollback "$TS" "$DEPLOY_DIR" "$SERVER_HEAD" || true
        ;;
    esac
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

bold "Deploying $SHORT to $DEPLOY_HOST ($(git log -1 --format=%s "$TARGET"))"
log "server is at ${SERVER_HEAD:0:7}; $(git rev-list --count "$SERVER_HEAD..$TARGET") new commit(s)"

remote_script > "$WORK/remote.sh"
scp -q "${SSH_OPTS[@]}" "$WORK/remote.sh" "$DEPLOY_HOST:/tmp/landing_page-deploy-$TS.sh"
if [ "$SERVER_HEAD" != "$TARGET" ]; then
  git bundle create -q "$WORK/deploy.bundle" "$SERVER_HEAD..$BRANCH"
  scp -q "${SSH_OPTS[@]}" "$WORK/deploy.bundle" "$DEPLOY_HOST:/tmp/landing_page-deploy-$TS.bundle"
fi
run() { remote bash "/tmp/landing_page-deploy-$TS.sh" "$1" "$TS" "$DEPLOY_DIR" "$SERVER_HEAD" "$TARGET"; }

print_backups() {
  log "backups: $DEPLOY_HOST:/root/landing_page-backups/$TS/ (content.db, data-uploads.tgz, .env, preserve/)"
  log "rollback image: hiko-landing-page-frontend-ts-staging:pre-$TS"
}

rollback() {
  PHASE=failed
  warn "$1 — rolling back"
  run rollback || warn "rollback reported a problem — check the server now"
  print_backups
  exit 1
}

# ── 2–3. Prepare + build (old container keeps serving) ─────────────────────
log "backing up and updating the checkout"
run prepare
PHASE=prepared
log "building the image on the server (the current container keeps serving)"
if ! run build; then
  PHASE=failed
  # A remote build failure already restored the checkout; a dropped ssh
  # connection did not. abort is idempotent, so always run it.
  warn "build failed or the connection dropped — restoring the checkout"
  run abort || warn "could not run abort on $DEPLOY_HOST — check $DEPLOY_DIR (git status) and /tmp/landing_page-deploy.lock by hand"
  print_backups
  die "build did not complete — the old container never stopped"
fi
PHASE=built

# ── 4. Switch ──────────────────────────────────────────────────────────────
log "starting the new container"
PHASE=activating
set +e
run activate
code=$?
set -e
if [ $code -eq 3 ]; then
  PHASE=failed
  print_backups
  die "the container port is published beyond 127.0.0.1 — fix docker-compose.override.yml on the server NOW"
fi
[ $code -eq 0 ] || rollback "the new container did not become healthy"

# ── 5. Smoke test through Cloudflare ───────────────────────────────────────
PHASE=smoke
log "smoke test via $DEPLOY_SITE_URL"
fetch_code() { curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$@" 2>/dev/null || echo 000; }
smoke_failed=""
for path in / /about /cv /cv/zh /blog /work /now /uses /contact /colophon /feed.xml /sitemap.xml; do
  code=000
  for _ in 1 2 3; do
    # A unique query string misses the edge cache, so the new origin answers.
    code=$(fetch_code "$DEPLOY_SITE_URL$path?deploy=$TS")
    [ "$code" = 200 ] && break
    sleep 4
  done
  printf '  %-12s %s\n' "$path" "$code"
  [ "$code" = 200 ] || smoke_failed="$smoke_failed $path($code)"
done
legacy=$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "$DEPLOY_SITE_URL/cv?lang=zh&deploy=$TS" 2>/dev/null || echo 000)
printf '  %-12s %s\n' "/cv?lang=zh" "$legacy"
case "$legacy" in "308 "*"/cv/zh"*) ;; *) smoke_failed="$smoke_failed /cv?lang=zh($legacy)" ;; esac
health=$(curl -fsS --max-time 20 "$DEPLOY_SITE_URL/api/health" 2>/dev/null || true)
grep -q '"status":"ok"' <<<"$health" || smoke_failed="$smoke_failed /api/health"
plain=$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "http://${DEPLOY_SITE_URL#https://}/" 2>/dev/null || echo 000)
case "$plain" in 30[178]" https://"*) ;; *) warn "http:// did not redirect to https:// ($plain) — run scripts/cloudflare-config.mjs" ;; esac

[ -z "$smoke_failed" ] || rollback "smoke test failed:$smoke_failed"

# ── 6. Done ────────────────────────────────────────────────────────────────
PHASE=finalizing
run finalize
print_backups
bold "Deployed $SHORT to $DEPLOY_SITE_URL"
log "post-deploy checks: E2E_BASE_URL=$DEPLOY_SITE_URL yarn e2e --grep-invert @admin"
