# syntax=docker/dockerfile:1.7

# Both stages use node:22-alpine pinned by digest (the multi-arch index as of
# 2026-10-13) instead of `apk upgrade` at build time: builds are reproducible,
# and Dependabot's docker ecosystem proposes the new digest when the image is
# rebuilt upstream (security fixes arrive as reviewable PRs).
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build

# better-sqlite3 ships a prebuilt binary for many platforms, but on alpine we
# fall back to a source build which needs python3 + a C++ toolchain.
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

COPY package.json yarn.lock ./

# --frozen-lockfile: fail the build if yarn.lock is out of sync with
# package.json instead of silently resolving a different dependency tree, so
# images are reproducible. CI already enforces the same flag. The yarn cache
# lives in a BuildKit cache mount: rebuilds re-link instead of re-downloading.
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    yarn install --frozen-lockfile

COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time, but
# .env is (correctly) excluded from the build context — pass them as build
# args instead (docker-compose.yml forwards them from .env; scripts/deploy.sh
# sets NEXT_PUBLIC_BUILD_SHA to the deployed commit for /colophon).
ARG NEXT_PUBLIC_SITE_HOST=""
ARG NEXT_PUBLIC_PRODUCT_NAME=""
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE="0"
ARG NEXT_PUBLIC_GA_ID=""
ARG NEXT_PUBLIC_BUILD_SHA=""
ENV NEXT_PUBLIC_SITE_HOST=$NEXT_PUBLIC_SITE_HOST \
    NEXT_PUBLIC_PRODUCT_NAME=$NEXT_PUBLIC_PRODUCT_NAME \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=$NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE \
    NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID \
    NEXT_PUBLIC_BUILD_SHA=$NEXT_PUBLIC_BUILD_SHA \
    NEXT_TELEMETRY_DISABLED=1

# Next's webpack cache persists in a cache mount between builds (it is not
# part of the image either way).
RUN --mount=type=cache,target=/app/.next/cache \
    yarn build

# `next build` renders the static pages through the content store, which
# creates (and auto-seeds) data/content.db inside the build stage, and the
# standalone tracer may copy it into .next/standalone/data. Runtime state never
# belongs in an image: a stale build-time DB would be copied into a fresh data
# volume, look like "existing content" to the entrypoint and shadow R2.
#
# yarn 1 ignores the `libc` field of sharp's optional dependencies, so both the
# glibc (sharp-linux-*, sharp-libvips-linux-*) and the musl builds are
# installed and traced. Alpine runs musl only: drop the glibc ones.
RUN rm -f .next/standalone/data/content.db .next/standalone/data/content.db-* \
 && rm -rf .next/standalone/node_modules/@img/sharp-linux-* \
           .next/standalone/node_modules/@img/sharp-libvips-linux-* \
 && test -f .next/standalone/.next/prerender-manifest.json


FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS release

ARG NEXT_PUBLIC_BUILD_SHA=""
LABEL org.opencontainers.image.source="https://github.com/hiko-server/landing_page" \
      org.opencontainers.image.revision=$NEXT_PUBLIC_BUILD_SHA

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache dumb-init

WORKDIR /app

# Non-root runtime user. Local SQLite database lives in /app/data: mount this
# dir as a volume to persist content across container restarts.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs \
 && mkdir -p .next /app/data \
 && chown nextjs:nodejs .next /app/data

COPY --from=build --chown=nextjs:nodejs /app/public ./public
# Runtime uploads dir (mounted as a volume in docker-compose.yml). Created
# here so a fresh named volume inherits nextjs ownership.
RUN mkdir -p /app/public/uploads && chown nextjs:nodejs /app/public/uploads

# The standalone output carries server.js plus every node_module the server
# traced — including better-sqlite3, @aws-sdk/client-s3, gray-matter and sharp,
# which the plain-Node content scripts below import as well (asserted below).
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

# Sync scripts + entrypoint pull editorial content from R2 on startup;
# scripts/warm-isr.mjs then regenerates the prerendered pages, reading the
# preview id from /app/.next/prerender-manifest.json (shipped by standalone).
COPY --from=build --chown=nextjs:nodejs /app/scripts ./scripts
COPY --chown=nextjs:nodejs docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh \
 && test -f /app/.next/prerender-manifest.json \
 && test -f /app/scripts/warm-isr.mjs \
 && test -f /app/scripts/sync-from-r2.mjs \
 && test -f /app/scripts/content-helpers.mjs \
 && test ! -e /app/data/content.db \
 && node -e "require('better-sqlite3')(':memory:').close(); require('gray-matter'); require('@aws-sdk/client-s3'); require('sharp')"

USER nextjs


EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Liveness probe — hits /api/health (verifies the SQLite store is reachable),
# giving the orchestrator a real signal instead of just "process is up".
# Alpine's busybox wget is sufficient; no extra package needed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

# dumb-init is PID 1: it forwards SIGTERM to the entrypoint's whole process
# group (R2 sync, server, ISR warm-up) and reaps children, so `docker stop`
# ends the server promptly instead of waiting for the SIGKILL timeout.
ENTRYPOINT ["/usr/bin/dumb-init", "--", "/app/docker-entrypoint.sh"]
