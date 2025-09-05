#NEW
FROM node:18-alpine AS build

RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY package.json yarn.lock* ./


RUN yarn install

COPY . .
RUN yarn build


FROM node:18-alpine AS release
# FROM node:18-slim AS release

ENV NODE_ENV=production

RUN apk update && apk upgrade
RUN apk add --no-cache dumb-init

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

RUN mkdir .next
RUN chown nextjs:nodejs .next

COPY --from=build --chown=nextjs:nodejs /app/next.config.js ./

COPY --from=build --chown=nextjs:nodejs /app/public ./public

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static


USER nextjs


EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME localhost

CMD ["node", "server.js"]


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