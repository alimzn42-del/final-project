# 05 — Roadmap

## Phase 1 — Scene and skeleton (now)

1. Monorepo, tooling, Docker Compose with all five services running.
2. Shared package: machine schema, topics, payload, state roll-up, with tests.
3. Backend: own auth with three roles (manager, worker, customer), customer self-signup, machine
   endpoint, MQTT ingest, Timescale storage, WebSocket push.
4. Simulator publishing every sensor from `machine.json`.
5. Frontend: login, language switch (en/ar, RTL), the four navigation levels, 3D scene built from
   `machine.json`, state colors, component page with live values and trend charts, SIMULATION badge.
6. Worker and customer routes as placeholders. Customer sign-up page works.
7. Last step of phase 1: user management page for managers: create manager and worker accounts,
   manage departments (add, rename, delete), and edit a worker's department (owner, step 9).

Done when: `docker compose up --build` starts everything, a manager can log in, browse every level,
and see values moving.

### Build plan: one step at a time, each reviewed by the owner before the next

Agreed with the owner before step 1; brand items added after the brand doc; later owner decisions
noted in the rows. Each step has its own branch and is merged into `main` after the owner's review.

| # | What it builds | Why here | How we check it | Status |
|---|---|---|---|---|
| 1 | Monorepo: pnpm workspace, strict TypeScript, ESLint + Prettier, Vitest, empty `shared` / `backend` / `simulator` / `frontend` packages, root scripts, git | Everything sits on this | `pnpm i && pnpm lint && pnpm test && pnpm build` pass; a deliberate lint error fails | done |
| 2 | Docker Compose with `db` (TimescaleDB, PG16) and `mqtt` (Mosquitto with a password), `.env.example`, named volumes, health checks | Backend and simulator need a database and a broker | Both containers healthy; a test message goes through the broker and back; the `timescaledb` extension is present | done |
| 3 | `shared`: zod schema for `machine.json`, a loader, data-rule tests (unique topics, unique names per page, every key in both locale files) | This schema is the contract for all other packages | Tests pass on the real file; a copy with a duplicate topic fails with a clear message | done |
| 4 | `shared`: topic builder/parser, payload schema, state logic (limits, offline by data age, worst-state roll-up) | Simulator, backend and frontend all use it | Unit tests for every limit key, "fault beats warn", offline timing and the roll-up | done |
| 5 | Simulator v1: publishes all 60 sensors from `machine.json`, Dockerfile | Gives the backend real messages | `lab/mixline/#` shows exactly 60 topics; every payload passes the shared schema | done |
| 6 | Backend skeleton: settings checked at startup, `GET /api/machine`, locale files served, health endpoint, Dockerfile | Smallest backend, proves the config flow | The checked JSON is served; a broken `machine.json` stops startup with a clear error | done |
| 7 | Database: Prisma, hypertable, 7-day raw data, 1-year 1-minute summary, compression | Auth and telemetry need tables | Migrations run on an empty database; the hypertable and policies exist | done |
| 8 | Auth: hashed passwords, seeded manager, login, customer sign-up, manager-creates-user endpoint, role guards, rate limits | The API must be protected before telemetry is exposed | Sign-up with `role: manager` still creates a customer; a customer gets 403 on telemetry; too many logins get 429 | done |
| 9 | Telemetry intake: MQTT subscription, batched inserts, latest value per sensor, latest/history endpoints | Turns messages into stored data | Rows grow with the simulator running; history returns points; latest returns 60 values | done |
| 10 | Live push (socket.io) and state module | The UI needs live updates | A test client receives updates; a customer is refused at connect; stopping the simulator turns parts offline after 10 s | done |
| 11 | Frontend skeleton: routes, en/ar with right-to-left, login, sign-up and forced password change pages, role guards, placeholder pages, nginx proxy, Dockerfile. **Brand:** dark and light themes from the colour tokens, bundled IBM Plex fonts, initial SVG logo, header. **Owner, step 11:** sessions on the server (logout revokes, password change logs out other devices) | The pages need routing, auth and language before the 3D scene | Manager logs in; a new customer lands on `/customer`; a customer typing `/line` is redirected; Arabic switches to right-to-left; a lint rule rejects hardcoded strings; a token used after logout gets 401 and its live connection is closed | built, owner review |
| 12 | 3D scene, static, from `machine.json` (boxes, cylinders, anchors, rotation, hollow boxes, liquids, pending placeholders), orbit limits. **Brand:** brand blue glow on hover, status colours kept separate from brand blue | Hardest visual part, so it is isolated | Owner reviews it against the spec; transform tests for known parts; frame rate on a phone | |
| 13 | Navigation: 4 levels, framing per page, breadcrumbs, hover names, click to navigate. **Brand:** camera glides between levels, honours reduced motion | Builds on the static scene | Every section, sub-section and part is reachable by click and by URL | |
| 14 | Live data in the UI: state colours and roll-up, values panel, trend charts, reserved twin slots, SIMULATION badge. **Brand:** state chips, Plex Mono numbers that do not jump, one pulse on a state change | Connects the UI to steps 9 and 10 | Values move; parts with no data turn grey (offline), visible from level 1. (Planned as "a fault value shows red"; phase 1 has no limits since the owner's step 6 decision.) | |
| 15 | Simulator v2: batch of about 3 minutes, masses balance, state and batch messages | Realism only matters once the UI can show it | Watch one full cycle; masses balance across scales | |
| 16 | User management page (`/users`, managers only): create manager and worker accounts, manage departments, change a worker's department. Then the phase 1 acceptance run: `docker compose up --build` from a clean clone, arm64 build check, README | The phase 1 "done when" test | Walk through the done criteria together | |

## Design decisions that shape phase 1

- **The PLC owns all limits, alarms, interlocks and safety decisions** (owner, step 6). The web app
  only reads and displays what the PLC reports. Phase 1 therefore has no limits in `machine.json`:
  a sensor is only `ok` or `offline`. No rejection log or rejection counts are built; the backend
  simply drops malformed messages without crashing. Alarms per component are defined later with
  the PLC program (open item below).

## Repository

Local on the owner's laptop, pushed to GitHub: https://github.com/alimzn42-del/final-project (account `alimzn42-del`;
repo already created). Commit and push after every finished task; see the git workflow in
`CLAUDE.md`.

## Later (do not build yet)

- Manager actions: start/stop batch, recipes, color targets, orders.
- Worker interface.
- Customer interface: order a color and quantity, from a kiosk next to the line and from a phone.
  The kiosk is one shared device: log out automatically after each order and after a few minutes
  without activity; phones keep the normal session (owner, step 9).
- Digital twin: predicted values, residuals, fault detection, health index, remaining useful life,
  what-if scenarios.
- Alarms UI and acknowledgement from the web.
- Real hardware: Raspberry Pi and ESP32 publishing instead of the simulator.
  - Rejection counting (owner, step 9: not before, since the simulator never sends invalid data,
    so the counts would always be zero). Starting draft:
    - count dropped messages per station (the station segment of the topic), plus one "unknown"
      bucket for topics that do not belong to this machine;
    - per station: total, a count per reason (bad JSON, wrong unit, unknown code, ...), and the
      last reason and time;
    - exposed at `GET /api/telemetry/rejections` to managers and workers; later shown on screen;
    - log one warning when a station starts rejecting and one when it stops (not one per
      message, to avoid flooding the log);
    - kept in memory: starts from zero when the backend restarts.
- Grafana dashboards (optional, reads the same database).

## Before deploying to the Raspberry Pi

- Slim the migrate image (now 702 MB).

Decided not to do (owner, step 9): trimming Prisma's query engines for databases we do not use
(~60 MB). 60 MB does not matter on the Pi, and the trimming would break on Prisma upgrades.
Revisit only if space becomes a real problem.

## Open items (blocked on decisions or purchases)

| Item | Blocks |
|---|---|
| Container choice (market search) | belt width, feeder, lid magazine, press, pusher, platforms, nozzle height, tray slots |
| Dye tank size (700 ml vs 1 L) | dye tank geometry, load cell rating |
| Filling pump type | filling station geometry |
| Mixer design (teammate) | mixer geometry, shelf height |
| Batch tray mechanism (6-slot linear tray does not fit the table) | tray geometry and sensors |
| Vessel anti-rotation | small parts under the vessel |
| PLC model (supervisor) | cabinet interior |
| Worker departments: which sections each department can open (now every worker can open every section) | per-department access in the backend and the navigation |
| PLC alarm list, message-format rules, and how alarms reach the web app | warning / fault states, alarm display, the `alarms` table, limits in `machine.json` |
| How customers reach the app from the internet (hosting, tunnel, or cloud server for ordering only) | customer ordering from phones |
| Password reset and email verification (need an email provider) | customer self-signup hardening |

### Deferred with "PLC alarm list ..."

- The `alarms` table (owner, step 7). It is not created in phase 1. First draft, to revisit with
  the PLC alarm list: `alarms` (id, component_id, level, message, raised_at, acked_at). Its final
  shape follows how the PLC reports alarms and how they reach the web app.

When one of these is decided, update `docs/02-line-spec.md` and `config/machine.json` together.
