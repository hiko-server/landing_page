FROM node:22-alpine AS build

# better-sqlite3 ships a prebuilt binary for many platforms, but on alpine we
# fall back to a source build which needs python3 + a C++ toolchain.
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

COPY package.json yarn.lock* ./

# --frozen-lockfile: fail the build if yarn.lock is out of sync with
# package.json instead of silently resolving a different dependency tree, so
# images are reproducible. CI already enforces the same flag.
RUN yarn install --frozen-lockfile

COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time, but
# .env is (correctly) excluded from the build context — pass them as build
# args instead (docker-compose.yml forwards them from .env).
ARG NEXT_PUBLIC_SITE_HOST=""
ARG NEXT_PUBLIC_PRODUCT_NAME=""
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE="0"
ARG NEXT_PUBLIC_GA_ID=""
ENV NEXT_PUBLIC_SITE_HOST=$NEXT_PUBLIC_SITE_HOST \
    NEXT_PUBLIC_PRODUCT_NAME=$NEXT_PUBLIC_PRODUCT_NAME \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=$NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE \
    NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID \
    NEXT_TELEMETRY_DISABLED=1

RUN yarn build


FROM node:22-alpine AS release
# FROM node:22-slim AS release

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk update && apk upgrade
RUN apk add --no-cache dumb-init

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

RUN mkdir .next
RUN chown nextjs:nodejs .next

# Local SQLite database lives here. Mount this dir as a volume to persist
# content across container restarts.
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

COPY --from=build --chown=nextjs:nodejs /app/next.config.js ./

COPY --from=build --chown=nextjs:nodejs /app/public ./public
# Runtime uploads dir (mounted as a volume in docker-compose.yml). Created
# here so a fresh named volume inherits nextjs ownership.
RUN mkdir -p /app/public/uploads && chown nextjs:nodejs /app/public/uploads

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

# Sync scripts + entrypoint pull editorial content from R2 on startup.
COPY --from=build --chown=nextjs:nodejs /app/scripts ./scripts
COPY --chown=nextjs:nodejs docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# The standalone server already bundles most deps, but the R2 sync scripts
# run as plain Node and need their own copy of better-sqlite3 + AWS SDK +
# gray-matter at runtime.
COPY --from=build --chown=nextjs:nodejs /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=build --chown=nextjs:nodejs /app/node_modules/@aws-sdk ./node_modules/@aws-sdk
COPY --from=build --chown=nextjs:nodejs /app/node_modules/gray-matter ./node_modules/gray-matter

USER nextjs


EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME 0.0.0.0

# Liveness probe — hits /api/health (verifies the SQLite store is reachable),
# giving the orchestrator a real signal instead of just "process is up".
# Alpine's busybox wget is sufficient; no extra package needed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]

