#!/usr/bin/env bash
# Fixture gates — the performance, layout, cross-engine and visual checks on
# the synthetic fixture store, run in the pinned Linux Playwright image the
# visual baselines were made in (README → Quality gates).
#
#   scripts/check-fixture-gates.sh [--update-snapshots]
#
# Needs Docker. Run it before pushing changes to public UI, images, fonts or
# the performance budget; --update-snapshots regenerates
# e2e/visual.spec.ts-snapshots after an intended visual change (review the
# PNGs before committing them).
#
#   1. copy       this checkout's tracked files and working-tree changes into
#                 a scratch tree under $HOME (Docker on macOS shares only
#                 $HOME); never data/, public/uploads, the owner's photos or
#                 .env — the fixture store replaces the git seeds there
#   2. build      yarn install --frozen-lockfile, the fixture store
#                 (scripts/ci/fixture-store.mjs), yarn build — TZ=UTC and
#                 NEXT_PUBLIC_SITE_HOST=example.com like the baselines
#   3. gates      Core Web Vitals on a calibrated phone profile (CLS ≤ 0.05,
#                 TBT ≤ 200 ms, one worker), then the layout / image /
#                 cross-engine (Chromium, WebKit, Firefox) and visual specs
#
# The scratch tree stays under ~/.cache/landing-fixture-gates for the
# Playwright report (playwright-report/, test-results/) and is replaced on
# the next run.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
SRC="$(pwd)"

UPDATE=0
case "${1:-}" in
  '') ;;
  --update-snapshots) UPDATE=1 ;;
  *) echo "usage: scripts/check-fixture-gates.sh [--update-snapshots]" >&2; exit 2 ;;
esac

IMAGE="mcr.microsoft.com/playwright:v1.63.0-noble"
WT="${HOME}/.cache/landing-fixture-gates"

step() { printf '\033[1m[fixture-gates]\033[0m %s\n' "$*"; }

command -v docker >/dev/null || { echo "Docker is required" >&2; exit 1; }

step "copy → $WT"
rm -rf "$WT"
mkdir -p "$WT"
# Tracked files plus untracked-but-not-ignored ones (new files of the change under test).
git ls-files -z --cached --others --exclude-standard | while IFS= read -r -d '' f; do
  [ -f "$f" ] || continue
  mkdir -p "$WT/$(dirname "$f")"
  cp -p "$f" "$WT/$f"
done
rm -rf "$WT/data" "$WT/public/uploads" "$WT/public/images/imageScroller"
mkdir -p "$WT/data"
cp data/home.json data/cvdata.json "$WT/data/"

SNAPSHOT_FLAG=""
[ "$UPDATE" = 1 ] && SNAPSHOT_FLAG="--update-snapshots"

step "build and gates in $IMAGE"
docker run --rm --ipc=host \
  -v "$WT":/work -w /work \
  -e HOME=/root -e TZ=UTC -e NEXT_TELEMETRY_DISABLED=1 -e NEXT_PUBLIC_SITE_HOST=example.com \
  -e E2E_FIXTURE=1 -e E2E_BASE_URL=http://127.0.0.1:3100 \
  -e JWT_SECRET=fixture-gates-placeholder-not-a-real-secret-32 \
  -e ADMIN_EMAIL=ci@example.com -e ADMIN_PASS=fixture-gates-placeholder-not-a-secret \
  -e SNAPSHOT_FLAG="$SNAPSHOT_FLAG" \
  "$IMAGE" bash -lc '
    set -euo pipefail
    corepack enable >/dev/null 2>&1 || true
    yarn install --frozen-lockfile --silent
    node --import ./tests/register.mjs scripts/ci/fixture-store.mjs
    yarn -s build
    NODE_ENV=production nohup npx next start -p 3100 > /tmp/next.log 2>&1 &
    for _ in $(seq 1 90); do curl -fsS -o /dev/null http://127.0.0.1:3100/api/health && break; sleep 2; done
    curl -fsS -o /dev/null http://127.0.0.1:3100/api/health || { cat /tmp/next.log; exit 1; }
    # Alone (one worker): parallel tests would steal the CPU it measures.
    npx playwright test -c e2e/playwright.config.ts --project=chromium e2e/gates.spec.ts --grep @cwv --workers=1 --reporter=line
    npx playwright test -c e2e/playwright.config.ts --project=chromium --project=webkit --project=firefox --project=visual \
      e2e/gates.spec.ts e2e/visual.spec.ts e2e/perf.spec.ts --grep-invert @cwv --reporter=line $SNAPSHOT_FLAG
  '

if [ "$UPDATE" = 1 ]; then
  step "copying the regenerated baselines back"
  cp "$WT"/e2e/visual.spec.ts-snapshots/*.png "$SRC/e2e/visual.spec.ts-snapshots/"
  git -C "$SRC" status --short e2e/visual.spec.ts-snapshots
fi
step "passed"
