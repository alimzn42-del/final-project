# syntax=docker/dockerfile:1
# The web app: built with Vite, served by nginx, which also passes /api (and the
# live WebSocket) to the backend. Build context: the repo root.
# Multi-arch base images: the same file builds for amd64 (laptop) and arm64
# (Raspberry Pi 5).

ARG NODE_IMAGE=node:24.22.0-alpine3.24
# nginx running as a normal user (not root), listening on 8080.
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.28.0-alpine

# ---- build: install the workspace, build the web app ----
FROM ${NODE_IMAGE} AS build
RUN corepack enable
WORKDIR /repo

# Manifests first, so dependency layers are cached until a package.json changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .pnpmfile.cjs ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY apps/simulator/package.json apps/simulator/
RUN pnpm install --frozen-lockfile --filter mixline --filter "@mixline/frontend..."

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/frontend apps/frontend
# Type check, then the Vite build (shared is used from its source, no separate build).
RUN pnpm --filter @mixline/frontend build

# ---- runtime: nginx with the built files ----
FROM ${NGINX_IMAGE} AS runtime
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/frontend/dist /usr/share/nginx/html
