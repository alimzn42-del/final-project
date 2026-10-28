# MixLine — Digital Twin Web App

Graduation project, Damascus University, Control & Automation Engineering (team of 3).
A small automated liquid mixing-and-filling line (paint-factory style, tested with water and food dye)
plus a web app that shows the line as a live 3D digital twin.

This repo is the **web app**. The physical line is still being built.

## Read before working

| File | Read it when |
|---|---|
| `docs/01-overview.md` | Always, once, to understand the line |
| `docs/02-line-spec.md` | Touching the 3D scene, `machine.json`, sensors, or the simulator |
| `docs/03-ui-spec.md` | Touching pages, navigation, auth, i18n, layout |
| `docs/04-architecture.md` | Touching backend, MQTT, database, Docker, shared types |
| `docs/05-roadmap.md` | Planning work, or unsure if something is in scope |
| `docs/06-brand.md` | Any visual design: colors, type, logo, layout |

## Stack (decided)

- TypeScript everywhere. pnpm workspaces monorepo.
- Backend: NestJS (REST + WebSocket gateway + MQTT client).
- DB: PostgreSQL + TimescaleDB (relational data + telemetry hypertable).
- Frontend: React + Vite + React Three Fiber (Three.js) + React Router + i18next.
- Broker: Mosquitto (MQTT).
- Simulator: Node service that publishes fake telemetry on the real MQTT topics.
- Docker Compose runs everything. Images must also work on arm64 (Raspberry Pi 5 later).

## Repo layout

```
apps/frontend      React app
apps/backend       NestJS app
apps/simulator     fake telemetry publisher
packages/shared    types, zod schemas, MQTT topic helpers, machine.json schema
config/machine.json  single source of truth for the line
config/locales/     en.json and ar.json for every label key
docs/              specs (docs/brand/ holds the logo files)
docker/            container config: node-app.Dockerfile (image for every Node app, build arg APP),
                   web.Dockerfile + nginx/ (the web app behind nginx), mosquitto/ (broker config)
scripts/           repo scripts (check-infra, check-db, check-telemetry, check-live)
reference/         earlier planning files, kept unchanged, not used by the code
docker-compose.yml
.env.example       every setting; copy to .env (git-ignored) and set real passwords
```

Tooling: Node 24, pnpm 10, TypeScript 6.0 (7.0 is not yet supported by typescript-eslint),
ESLint 10 flat config with typescript-eslint strict type-checked rules, Prettier, Vitest 5.
`docs/`, `config/`, `reference/` and this file are excluded from Prettier so they keep their layout.

## Hard rules

1. `config/machine.json` is the source of truth. The 3D scene, the section tree, the sensor list
   and the simulator are all generated from it. Never hardcode geometry, IDs or sensor names
   in components.
2. Every component has a `status`: `confirmed`, `estimated` or `pending`. Do not treat
   `estimated` numbers as final. Do not invent geometry for `pending` items; render a labeled
   placeholder instead.
3. MQTT topic format is fixed (see `docs/04-architecture.md`). Do not change it.
4. The simulator must publish exactly what real hardware will publish, so swapping it for the
   Raspberry Pi / ESP32 later changes nothing in backend or frontend.
5. Three roles: `manager`, `worker`, `customer`. Own auth, works offline. Customers self-register;
   signup can only ever create `customer`. Customers never reach telemetry or control.
6. All UI text goes through i18next (`en` and `ar`). Arabic is RTL. No hardcoded strings.
7. Shapes in the scene are simple primitives (cylinders, boxes). No imported CAD for now.
8. Code quality at company level: strict TS, ESLint + Prettier, tests for shared logic,
   clear module boundaries, no secrets in the repo (`.env.example` only).

## Git workflow (owner's rule)

- Remote: https://github.com/alimzn42-del/final-project (branch `main`).

- Commit **as soon as each task is finished** and passes lint and tests. Small commits, one task each.
- **Push after every commit**, so GitHub always has the full history if anything breaks locally.
- Conventional commit messages: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, with the
  plan step number, e.g. `feat(shared): machine.json zod schema [step 3]`.
- One branch per plan step (`step-03-shared-schema`). After the owner reviews the step, merge into
  `main` and push `main`.
- Never commit secrets: `.env` is git-ignored, only `.env.example` is committed.
- Never rewrite pushed history (no force push) unless the owner asks.

## How to work with the owner (Mohammed)

- He is the final decision-maker. On any design decision not covered by the docs, ask him first.
  Ask the question and let him answer; do not propose an answer and ask "agree?".
- **If a task depends on something missing (a prerequisite, a decision, a part), flag the gap
  first, before starting the task.** This is very important to him.
- Do not ask questions that need industry experience he does not have yet. For those, explain
  the trade-off like a senior to a trainee, recommend, then check he understood.
- Discuss the logic before writing code. When giving code, explain what each part does.
- Be honest. If something he proposes is wrong, say so and why. No flattery.
- One concept at a time in explanations. End each idea with a one-line summary.
- He chats in Arabic (Syrian dialect) and English. Answer in the language he writes in.
- For AI / digital-twin model work later: focus on understanding the problem before the
  solution, and build models from their math foundation step by step.

## Commands

Run from the repo root:

| Command | What it does |
|---|---|
| `pnpm i` | Install all workspace dependencies |
| `pnpm lint` | ESLint + Prettier check (must pass before every commit) |
| `pnpm lint:fix` / `pnpm format` | Auto-fix lint issues / reformat code |
| `pnpm test` | All Vitest tests in every package, no Docker needed (must pass before every commit) |
| `pnpm test:db` | Database tests on a temporary real database (needs `pnpm infra:up`) |
| `pnpm test:watch` | Re-run tests on change |
| `pnpm typecheck` | TypeScript check of every package, tests included |
| `pnpm build` | Build every package to its `dist/` |
| `pnpm infra:up` | Start only db + mqtt in Docker and wait until healthy (needs `.env`) |
| `pnpm stack:up` | Build the app images and start every service (db, mqtt, migrate, backend, simulator) |
| `pnpm infra:check` | Verify the Docker stack (health, TimescaleDB, broker auth) |
| `pnpm db:migrate` | Apply database migrations to the database in `.env` (Prisma) |
| `pnpm db:check` | Run every migration on a temporary empty database and check the result |
| `pnpm --filter @mixline/backend db:migrate:dev` | After changing `schema.prisma`: create a new migration |
| `pnpm sim:check` | Listen 12 s and verify a running simulator (topics, payloads, intervals) |
| `pnpm telemetry:check` | Verify simulator -> MQTT -> backend -> database -> API on the running stack |
| `pnpm live:check` | Verify the live push (socket.io) on the running stack; stops the simulator ~15 s |
| `pnpm web:check` | Verify the web app through nginx (page, API, login, WebSocket, logout) |
| `pnpm stack:down` / `pnpm infra:down` | Stop the Docker stack; data volumes are kept |
| `pnpm dev` | Runs each app's `dev` script with live reload, using `.env` (backend :3000, web app :5173, simulator) |

`pnpm dev` and `pnpm sim:check` run on the laptop and need `pnpm infra:up` first. In Docker the web
app is at http://localhost:8080 (`WEB_PORT`). Build images one at a time on this laptop (Docker
Desktop has ~4 GB): `docker compose build migrate`, then `backend`, `simulator`, `frontend`.

Shell note: this laptop's fnm hook switches Node on `cd` into a folder with `.nvmrc`; in a
non-interactive shell use `builtin cd` if that hook errors.
