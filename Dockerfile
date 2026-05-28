#NEW
FROM node:22-alpine AS build

# better-sqlite3 ships a prebuilt binary for many platforms, but on alpine we
# fall back to a source build which needs python3 + a C++ toolchain.
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

COPY package.json yarn.lock* ./


RUN yarn install

COPY . .
RUN yarn build


FROM node:22-alpine AS release
# FROM node:22-slim AS release

ENV NODE_ENV=production

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

ENTRYPOINT ["/app/docker-entrypoint.sh"]


#OLD
# FROM node:18-slim

# WORKDIR /app

# COPY package.json .
# RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn install

# COPY . .
# RUN yarn build

# EXPOSE 3000

# ENV PORT 3000

# CMD ["yarn", "start"]