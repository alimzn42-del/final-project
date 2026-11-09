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
| 11 | Frontend skeleton: routes, en/ar with right-to-left, login, sign-up and forced password change pages, role guards, placeholder pages, nginx proxy, Dockerfile. **Brand:** dark and light themes from the colour tokens, bundled IBM Plex fonts, initial SVG logo, header. **Owner, step 11:** sessions on the server (logout revokes, password change logs out other devices) | The pages need routing, auth and language before the 3D scene | Manager logs in; a new customer lands on `/customer`; a customer typing `/line` is redirected; Arabic switches to right-to-left; a lint rule rejects hardcoded strings; a token used after logout gets 401 and its live connection is closed | done |
| 12 | 3D scene, static, from `machine.json` (boxes, cylinders, anchors, rotation, hollow boxes, liquids, pending placeholders), orbit limits. **Brand:** brand blue glow on hover, status colours kept separate from brand blue | Hardest visual part, so it is isolated | Owner reviews it against the spec; transform tests for known parts; frame rate on a phone | done |
| 13 | Navigation: 4 levels, framing per page, breadcrumbs, hover names, click to navigate. **Brand:** camera glides between levels, honours reduced motion | Builds on the static scene | Every section, sub-section and part is reachable by click and by URL | done |
| 14 | Live data in the UI: state colours and roll-up, values panel, trend charts, reserved twin slots, SIMULATION badge. **Brand:** state chips, Plex Mono numbers that do not jump, one pulse on a state change | Connects the UI to steps 9 and 10 | Values move; parts with no data turn grey (offline), visible from level 1. (Planned as "a fault value shows red"; phase 1 has no limits since the owner's step 6 decision.) | done (part of the badge check still open, below) |
| 15 | Simulator v2: batch of about 4 minutes (owner, step 15; planned as 3), masses balance, state and batch messages. **Owner, step 15:** Beer–Lambert colour model and CIEDE2000, 5 recipes with the minimum dyes each (every pump in at least two) in a separate tuning file, recipes with a deferred dye skipped, about 1 cup in 20 rejected, refills between batches as their own `batch/refill` message, sensor table inside the simulator | Realism only matters once the UI can show it | Watch one full cycle; masses balance across scales | done (cycle check by eye still open, below) |
| 16 | User management page (`/users`, managers only): create manager and worker accounts, manage departments, change a worker's department. **Owner, step 16:** staff only (customers later); new temporary password and disable / re-enable (no deleting, no role change), each ending all of that person's sessions; lockout protection in the backend (never disable yourself, never leave the line without an active manager); an append-only audit log of every account and department change (the backend's own database role may only add and read it, plus a database rule; viewer deferred); a checks account so automated checks never use a person's login. Then the phase 1 acceptance run: `docker compose up --build` from a clean clone, arm64 build check (built under emulation; the run on the Raspberry Pi 5 is pending), README | The phase 1 "done when" test | Walk through the done criteria together | done 2026-11-09 (owner: browser checks; users page and "Not installed" look still open, below) |
| 17 | The container and the parts list. **Owner, step 17:** the real tub (bottom Ø79, top Ø113, height 77, black PP body, clear snap-on flat lid confirmed; capacity, weights, rim and nesting step estimated), drawn on the belt only while a station's sensor sees one; no fixed batch size: the order decides, until then the simulator picks 4 to 10 (350 g each, all estimated); `machine.json` from the owner's parts list of 2026-11-09 (the reference for the hardware since then): the mixer frame, no floats, no conveyor speed control, the infeed gate, the panel with the three ESP32s, the network and the power, the tray and the customer camera not installed; the pump tubes, RS485 and Ethernet cables in the scene; the colour model for the new flow cell. **Owner, after seeing it:** the vessel alone and the camera box apart (not one lighting box); no station boxes ("station 1" is the zone its ESP32 controls; the ESP32s in the panel); the containers slide along the belt (option b, the belt's speed in `machine.json`). The gateway is planned for the hardware phase (below), not built. Scene rule: as close to the real line as possible, smooth on a phone | The line and the twin match the real hardware before web control | Browser checks in `QUESTIONS.md`; `pnpm sim:check` and a full cycle (`--cycle`) on the rebuilt stack | in review |

## Phase 2 — first step (owner, step 16)

Web control of the line, after step 17 (the container and the parts list, owner). The owner gives its
details then: which controls, who may use them, and how a command reaches the line (an MQTT
command topic would change hard rule 3, so it needs the owner's approval). Until then the simulator
runs its batches by itself and the web app only monitors.

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
- Customer accounts on the users page (owner, step 16): the staff list shows managers and
  workers only; customers get their own section later, with the customer pages.
- Deleting a customer account (owner, step 16): anonymize it instead of deleting it. Clear the
  name, email and phone (mobile) and keep the row, so the audit log stays intact: every entry
  keeps its author (the log refuses deleting an account it names, docs/04). Still to decide
  then: the rest of the sign-up profile (date of birth, governorate, country, city or area,
  occupation, paint purpose), and what takes the email's place, since the column is required
  and unique now.
- Audit log viewer (owner, step 16): every account and department change is stored from step 16
  (docs/04), but no page shows it yet.
- Department-based permissions (open item below): when a department decides what a worker may
  open, changing a worker's department must also end their sessions, like the other account
  actions (owner, step 16: it does not now, since it changes no access yet).
- Batch record for managers (owner, step 15): store the machine state and every batch message
  (`state`, `batch/<event>`, refills included) in the backend, and show them. Until then they are
  only published and checked (`pnpm sim:check`).
- Worker interface.
- Customer interface: order a color and quantity, from a kiosk next to the line and from a phone.
  The kiosk is one shared device: log out automatically after each order and after a few minutes
  without activity; phones keep the normal session (owner, step 9).
- Digital twin: predicted values, residuals, fault detection, health index, remaining useful life,
  what-if scenarios.
- Alarms UI and acknowledgement from the web.
- Real hardware: the PLC's data reaching MQTT instead of the simulator's.
  - **The gateway program** (owner, step 17; do not build yet). The ESP32 stations talk to the
    PLC over RS485, the PLC is on Ethernet. A gateway program reads the PLC (over Ethernet; the
    protocol, for example Modbus TCP, to choose with the PLC program) and publishes to MQTT with
    exactly the topics and messages the simulator uses now. It runs on the laptop for now and on
    the Raspberry Pi later. The web app and the simulator must not change because of it.
  - To decide with it: the clock (owner, step 17). The ESP32s are on RS485 now, not on the
    network, so the plan that the Pi serves them time over NTP no longer works. Likely the
    gateway stamps each reading when it reads the PLC (the backend also records when it receives
    each reading).
  - To decide with it: how the camera's readings (L\*a\*b\*, ΔE, white patch) reach MQTT: the Pi
    publishes them itself, or hands them to the gateway.
  - To decide with it: what the PLC publishes for the machine state and the batch messages
    (`state`, `batch/<event>`), the same formats as the simulator's.
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
  - Configuration mismatches on a page (owner, step 16): data from a part that `machine.json`
    marks `installed: false`. The backend logs it once per part since step 16; show it on screen
    together with the wrong-message counts above, as a configuration problem, never a line
    alarm.
- Grafana dashboards (optional, reads the same database).

## Before deploying to the Raspberry Pi

- **Open (owner, step 16): the first run of the stack on the Raspberry Pi 5.** Moved here from
  `QUESTIONS.md` (row 12) before the step 16 merge. On 2026-11-04 all four images were built for
  arm64 under emulation on the laptop, and their native programs were checked inside the images:
  Node, Prisma's migration engine, the password hashing library and nginx are all ARM aarch64.
  Still to do on the real Pi: clone, copy `.env`, `docker compose up --build`, then
  `pnpm infra:check`, `sim:check`, `telemetry:check`, `live:check` and `web:check`.
- Slim the migrate image (now 702 MB).

Decided not to do (owner, step 9): trimming Prisma's query engines for databases we do not use
(~60 MB). 60 MB does not matter on the Pi, and the trimming would break on Prisma upgrades.
Revisit only if space becomes a real problem.

## Browser checks still open

Moved from `QUESTIONS.md` at the step 16 merge (owner, 2026-11-09: merge, test these later). Each
needs the owner's manager login on the running stack (http://localhost:8080). Claude runs any
command a check needs; the owner only looks in the browser.

- **SIMULATION badge, the rest** (step 14, task 8). Seen on 2026-11-09: violet in the dark theme,
  in Arabic, and still there with the simulator stopped. Still to see: the light theme, and
  "54/54" at phone width (60 before step 17).
- **Step 15 acceptance** (doc 05 step 15). Watch one full cycle, about 5 minutes, on the line page,
  then the Mixing and Conveyor pages: the vessel fills and changes colour after each sample, the
  dye tanks drop, the pumps and the mixer switch on and off on the timelines, every container of
  the batch goes through (a reject now and then), the rinse clears the colour. The masses part
  passed (`pnpm sim:check --cycle`, 2026-11-04).
- **The users page** (step 16; owner: skipped, to test later). The staff list, a new account, a
  new temporary password, disable (the confirmation) and re-enable, moving a worker, the
  departments (add, rename, a refused delete); Arabic, light theme, phone width; the "disabled"
  message at login. Try disabling yourself (no button) and a test worker.
- **The "Not installed" look in the 3D view** (step 16; no test can see the 3D labels). The part
  dimmed in its own colours, never grey, with the "Not installed" tag; "Not installed" in the side
  panel and on its page; its section and the line not turned grey. Claude sets
  `"installed": false` on one dye pump in `config/machine.json` and restarts the backend and the
  simulator; the owner looks at the Mixing page and the pump's page; then it is set back.

## Known issues

- **One test failure, observed once, not reproduced** (step 15, 2026-11-04). During task 1 one
  test in the full suite (`pnpm test`, 487 tests then) failed on one run. Its name and output were
  not saved, so it is unexplained. It has not come back in 31 full runs since (25 of them in a
  row). If any test fails again with no code change: save the full output before running again,
  and add the test's name here.
- **A login-limit test timed out once in a full run** (step 17, 2026-11-09). `apps/backend`
  `auth/proxy.http.test.ts`, "behind nginx (TRUST_PROXY=1): each client has its own limit", took
  5.0 s and hit Vitest's 5 s limit during task 5, in an area step 17 did not touch. The next full
  run passed (620 tests, output saved), and alone it takes about 0.7 s (3 runs). It makes 12
  wrong logins, each a slow password check on purpose, so under the load of a full parallel run
  it can come close to 5 s. Possibly the same failure as above. Not changed: a longer time limit
  for this test is the likely fix, waiting for the owner. Seen a second time the same day (full
  run with the Docker stack running, 5.03 s; output saved); the next run passed (629 tests).

## Open items (blocked on decisions or purchases)

| Item | Blocks |
|---|---|
| Mixer design (teammate): the plain 5 V motor or the one with a speed sensor | mixer geometry, the `mixer.rpm` sensor, shelf height |
| Batch tray (owner, step 17: 6 slots on a rail with a stepper, as in the parts list, not installed): 6 slots are fewer than the largest batch (10), and the 800 mm table is too short for its travel | tray layout, its station and sensors |
| Container magazine tube (owner, step 17: 110 mm is an assumption): a 110 mm PVC pipe is about 103 mm inside, less than the 113 mm tub top | magazine size, the infeed gate |
| Reject bin (140 x 100 x 110, confirmed): 100 mm deep, narrower than the 113 mm tub top | reject bin size or the pusher's travel |
| Drain suction into the vessel (parts list: a hole in the wall or a rigid dip tube) | drain tube route |
| Sample pump driver (parts list: an H-bridge or a 2-channel relay) | station 2 wiring |
| Room for the ESP32s in the control panel (owner, step 17: in the panel, on a DIN rail): three fit beside the 24 V supply only at about 48 mm per enclosure; the fourth (tray, deferred) is not drawn | panel layout, enclosure size |
| Vessel anti-rotation | small parts under the vessel |
| Worker departments: which sections each department can open (now every worker can open every section) | per-department access in the backend and the navigation |
| PLC alarm list, message-format rules, and how alarms reach the web app | warning / fault states, alarm display, the `alarms` table, limits in `machine.json` |
| How customers reach the app from the internet (hosting, tunnel, or cloud server for ordering only) | customer ordering from phones |
| Password reset and email verification (need an email provider) | customer self-signup hardening |

### Deferred with "PLC alarm list ..."

- The `alarms` table (owner, step 7). It is not created in phase 1. First draft, to revisit with
  the PLC alarm list: `alarms` (id, component_id, level, message, raised_at, acked_at). Its final
  shape follows how the PLC reports alarms and how they reach the web app.

When one of these is decided, update `docs/02-line-spec.md` and `config/machine.json` together.
