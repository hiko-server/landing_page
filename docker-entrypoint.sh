#!/bin/sh
set -e

# Pull latest editorial content from Cloudflare R2 into the local SQLite DB
# before the Next.js server starts. Failure here is fatal (R2 is the
# canonical source on deploy) unless R2_REQUIRED is unset, in which case
# the script warns and continues — handy for offline dev.
echo "[entrypoint] Syncing content from R2…"
if ! node /app/scripts/sync-from-r2.mjs; then
  # A transient R2 outage shouldn't take the site down when we already have
  # content: the local SQLite DB is the source the app actually serves from
  # (R2 is the off-site replica). Only hard-fail on a fresh container that has
  # no DB yet, where R2 is the only way to obtain content.
  if [ -f /app/data/content.db ]; then
    echo "[entrypoint] WARNING: R2 sync failed — continuing with existing local content.db."
  else
    echo "[entrypoint] R2 sync failed and no local content.db exists — aborting startup."
    exit 1
  fi
fi

echo "[entrypoint] Launching Next.js server…"
exec dumb-init node /app/server.js
