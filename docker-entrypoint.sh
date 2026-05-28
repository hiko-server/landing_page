#!/bin/sh
set -e

# Pull latest editorial content from Cloudflare R2 into the local SQLite DB
# before the Next.js server starts. Failure here is fatal (R2 is the
# canonical source on deploy) unless R2_REQUIRED is unset, in which case
# the script warns and continues — handy for offline dev.
echo "[entrypoint] Syncing content from R2…"
node /app/scripts/sync-from-r2.mjs || {
  echo "[entrypoint] R2 sync failed — aborting startup."
  exit 1
}

echo "[entrypoint] Launching Next.js server…"
exec dumb-init node /app/server.js
