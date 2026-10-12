#!/bin/sh
# Container entrypoint. Runs under dumb-init (see Dockerfile ENTRYPOINT), so
# dumb-init is PID 1: it forwards SIGTERM/SIGINT to this script's whole
# process group (the R2 sync while it runs, then the server and the ISR
# warm-up) and reaps every child — `docker stop` stops the server promptly.
set -eu

# 1. Reconcile the local SQLite store with R2 before serving anything.
#    sync-from-r2.mjs decides from the store's content *before* it syncs:
#      0  synced (or R2 not configured and R2_REQUIRED is not 1)
#      3  R2 failed, but the existing local content is intact → serve it
#      1  R2 failed and there is no local content (or R2 is required but not
#         configured) → refuse to start an empty site; the restart policy
#         retries until R2 is reachable again.
echo "[entrypoint] Syncing content from R2…"
status=0
node /app/scripts/sync-from-r2.mjs || status=$?
case "$status" in
  0) ;;
  3) echo "[entrypoint] WARNING: R2 sync failed — serving the existing local content." ;;
  *)
    echo "[entrypoint] R2 sync failed (exit $status) and there is no local content to serve — aborting startup."
    exit 1
    ;;
esac

# 2. The image is built without a content DB, so every statically generated
#    page baked into it was rendered from an empty store. Once the server is
#    healthy, regenerate them in the background (best effort, always exits 0).
node /app/scripts/warm-isr.mjs &

# 3. Replace this shell with the server so dumb-init's signals reach it directly.
echo "[entrypoint] Launching Next.js server…"
exec node /app/server.js
