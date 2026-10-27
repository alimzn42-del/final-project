# syntax=docker/dockerfile:1
# One image recipe for every Node app in apps/ (backend, simulator).
# Build context: the repo root. Choose the app with the APP build argument:
#   docker build -f docker/node-app.Dockerfile --build-arg APP=backend .
# Multi-arch base image: the same file builds for amd64 (laptop) and arm64
# (Raspberry Pi 5).

ARG NODE_IMAGE=node:24.22.0-alpine3.24

# ---- build: install the workspace, compile shared + the app ----
FROM ${NODE_IMAGE} AS build
ARG APP
RUN test -n "$APP" || (echo "build argument APP is required" && exit 1)
# OpenSSL: Prisma's migration engine needs it (backend; harmless for other apps).
# Build stage only: runtime images do not get it.
RUN apk add --no-cache openssl
RUN corepack enable
WORKDIR /repo

# Manifests first, so dependency layers are cached until a package.json changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .pnpmfile.cjs ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY apps/simulator/package.json apps/simulator/
# The backend generates its Prisma client during install, so it needs its schema first.
COPY apps/backend/prisma apps/backend/prisma
COPY apps/backend/prisma.config.ts apps/backend/
RUN pnpm install --frozen-lockfile --filter mixline --filter "@mixline/${APP}..."

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/${APP} apps/${APP}
RUN pnpm --filter "@mixline/${APP}..." build
# A self-contained folder: the app's dist/ plus production dependencies only
# (shared included as a normal package with its dist/). No install scripts here:
# everything was generated and compiled above.
RUN pnpm --filter "@mixline/${APP}" deploy --prod --legacy --ignore-scripts /out

# ---- migrate (backend only): applies the database migrations, then exits ----
# Built with `target: migrate` by docker-compose.yml. It reuses the build stage,
# which already has the Prisma CLI and its migration engine (downloaded at
# install time, so nothing is fetched when the container starts).
FROM build AS migrate
WORKDIR /repo/apps/backend
USER node
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

# ---- runtime: only what the app needs to run ----
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
# config/ is mounted here by docker-compose.yml, so a new machine needs no rebuild.
ENV MACHINE_CONFIG=/config/machine.json \
    LOCALES_DIR=/config/locales
CMD ["node", "dist/main.js"]
