# syntax=docker/dockerfile:1
# MixLine simulator image. Build context: the repo root (see docker-compose.yml).
# Multi-arch base image: the same Dockerfile builds for amd64 (laptop) and
# arm64 (Raspberry Pi 5).

ARG NODE_IMAGE=node:24.22.0-alpine3.24

# ---- build: install the workspace, compile shared + simulator ----
FROM ${NODE_IMAGE} AS build
RUN corepack enable
WORKDIR /repo

# Manifests first, so dependency layers are cached until a package.json changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY apps/simulator/package.json apps/simulator/
RUN pnpm install --frozen-lockfile --filter mixline --filter "@mixline/simulator..."

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/simulator apps/simulator
RUN pnpm --filter "@mixline/simulator..." build
# A self-contained folder: the simulator's dist/ plus production dependencies only
# (shared included as a normal package with its dist/).
RUN pnpm --filter @mixline/simulator deploy --prod --legacy /out

# ---- runtime: only what the simulator needs to run ----
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
# machine.json is mounted here by docker-compose.yml, so a new machine needs no rebuild.
ENV MACHINE_CONFIG=/config/machine.json
CMD ["node", "dist/main.js"]
