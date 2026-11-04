# 04 — Architecture

## Services (docker-compose)

| Service | Image / app | Role |
|---|---|---|
| `db` | `timescale/timescaledb:2.30.2-pg16` (PostgreSQL 16) | users, config, telemetry hypertable |
| `mqtt` | `eclipse-mosquitto:2.0.22` | message broker |
| `migrate` | `apps/backend` (Prisma CLI, one-shot) | applies database migrations, then exits |
| `backend` | `apps/backend` (NestJS) | REST, auth, MQTT ingest, WebSocket push |
| `frontend` | `apps/frontend` (Vite build served by nginx) | the web app; passes `/api` and the live WebSocket to the backend |
| `simulator` | `apps/simulator` (Node) | publishes fake telemetry |

- All images must have arm64 builds (Raspberry Pi 5 later). Runs on a laptop for now.
  Third-party images are pinned to exact versions (both above are multi-arch, arm64 included).
- Config through env vars; commit `.env.example` only.
- Named volumes for db and broker data.
- Host ports are bound to `127.0.0.1` only (local tools); services reach each other by service
  name on the Compose network. The one exception is `frontend` (`WEB_PORT`, 8080 by default):
  browsers on the lab network open `http://<computer>:8080`.
- Mosquitto: anonymous clients are refused. The account comes from `MQTT_USERNAME` /
  `MQTT_PASSWORD` in `.env`; `docker/mosquitto/entrypoint.sh` writes the password file at
  container start, so no password is stored in the repo or the image.
- TimescaleDB's anonymous usage telemetry is switched off (`timescaledb.telemetry_level=off`):
  the line runs offline and sends no data out.
- Commands: `pnpm infra:up` (db + mqtt only, wait until healthy), `pnpm stack:up` (every service,
  images rebuilt), `pnpm infra:check` (verify), `pnpm stack:down` / `pnpm infra:down` (stop; data
  volumes are kept).

```
 ESP32 / Pi (later)  ─┐
                      ├──MQTT──> mosquitto ──> backend ──WebSocket──> frontend
 simulator (now)    ──┘                           │
                                                   └──> TimescaleDB
```

## MQTT

Topic format (fixed, from the project plan):

```
<site>/<machine>/<station>/sensors/<variable>
<site>/<machine>/<station>/twin/<variable>        (later)
<site>/<machine>/<station>/health/<component>     (later)
<site>/<machine>/state
<site>/<machine>/batch/<event>
```

- `site` = `lab`, `machine` = `mixline` (from `machine.json`).
- `station` and `variable` come from each component's sensor list in `machine.json`.
- Example: `lab/mixline/mixer/sensors/mass`.

Payload (JSON):

```json
{ "ts": "2026-10-27T12:00:00.000Z", "value": 1834.2, "unit": "g", "source": "sim" }
```

`source` is `sim` or `hw`. The frontend shows the SIMULATION badge while at least one sensor's
latest reading is `sim` (doc 03, "Simulated data").
`value` is always a number. Digital: 1/0. Enum: the integer code listed in the sensor's `valueLabels`.

Publishing rules (simulator now, hardware later):
- Analog sensors: on a fixed timer (1 Hz idle, up to 5 Hz while dosing or filling).
  Simulator v2 (step 15): 5 Hz for the sensors the moving liquid changes, until 1 s after the
  pump stops: the vessel scale and the running dye pump's tank scale, steps, speed and load
  while dosing dye; the vessel scale, base pump current and big tank level while the base pump
  runs; the vessel and filling scales while filling, and the check scale while its platform
  is up. Everything else stays at 1 Hz (draining and sampling too).
- Digital and enum sensors: on change, plus a heartbeat every 5 s.
- A sensor with no message for 10 s is `offline`.
- Scales publish **net liquid mass** in grams. The vessel and dye scales are tared with the empty
  vessel/tank. Filling and check scales subtract `container.tareG`.
- `bigTank.level` is the liquid height above the tank bottom in mm.

Machine-wide messages (published from simulator v2, step 15):

`lab/mixline/state` (retained, QoS 1):
```json
{ "ts": "...", "mode": "auto", "status": "running", "batchId": "B-20261104-080005", "source": "sim" }
```
- `mode`: `auto | manual`. `status`: `idle | running | paused | stopped | fault`.
- Sent when it changes, and again after a reconnect.

`lab/mixline/batch/<event>` (QoS 1), event one of `started | step | finished | aborted`:
```json
{ "ts": "...", "batchId": "B-20261104-080005", "step": "dyeDose",
  "recipe": { "targetLab": [53.9, -33.78, 35.72] }, "containersDone": 3, "source": "sim" }
```
- `step` one of: `baseFill, dyeDose, mix, sample, correct, complete, finalCheck, filling, rinse`.
- `started` carries the first step; `step` is sent at every step change and each time
  `containersDone` grows during `filling`; `finished` carries the last step.
- Batch ids are made from the start time (UTC), so they stay unique across restarts.

`lab/mixline/batch/refill` (QoS 1; owner, step 15): what a worker refilled or emptied **between
batches**, so it is never a step of a batch. The simulator sends it now; later a real worker, or a
robot that takes the full tray, sends the same message.
```json
{ "ts": "...", "batchId": null,
  "items": [
    { "component": "bigTank", "action": "refilled", "amount": 8367.7, "unit": "g" },
    { "component": "containerMagazine", "action": "refilled", "amount": 24, "unit": "count" },
    { "component": "drainBucket", "action": "emptied", "amount": 9850.4, "unit": "g" },
    { "component": "batchTray", "action": "emptied", "amount": 6, "unit": "count" }
  ],
  "source": "sim" }
```
- `batchId` is always `null`.
- `component`: the part's id in `machine.json`, checked against it (`decodeRefill()`), so another
  machine needs no change to the format. The web app names parts through each one's `labelKey`.
- `action`: `refilled | emptied`. `amount`: what was added or taken away, more than 0: grams
  (`g`) for the tanks and the drain bucket, a whole `count` for cups, lids, the reject box and
  the tray. The mass-balance check needs these amounts.
- Each part appears once per message.

Storing and showing the machine state and batch messages is a later manager feature (doc 05);
for now they are published and checked (`pnpm sim:check`).

Topic builders and the payload zod schemas live in `packages/shared` (`decodeBatchMessage()`
checks any `batch/<event>` with its own schema).

## Backend (NestJS)

Modules:
- `auth`: own auth (no third-party providers). Login, JWT, roles `manager` / `worker` / `customer`,
  guards. Seed one manager user from env. `POST /api/auth/signup` always creates a `customer`.
  Managers create `manager` and `worker` accounts through a protected endpoint.
  Rate-limit login and signup. Built in step 8:
  - **Default deny:** a global guard requires a login on every route unless it is marked
    `@Public()` (health, locales, login, sign-up, logout); `@Roles(...)` narrows further.
  - Endpoints: `POST /api/auth/signup` (always `customer`, logs in), `POST /api/auth/login`,
    `POST /api/auth/logout`, `GET /api/auth/me`, `PATCH /api/auth/me` (language, theme),
    `POST /api/users` (managers create `manager` or `worker`).
  - Passwords: **argon2id** (`@node-rs/argon2`, OWASP settings: 19 MiB, 2 passes, 1 lane;
    prebuilt for Windows and Alpine x64/arm64, no install script). An unknown email still costs
    one password check, and wrong email and wrong password give the same answer.
  - Session: HS256 JWT (`jose`) holding the user id and a session id, in an **httpOnly,
    SameSite=Strict cookie** `mixline_session` on `/api`; lifetime `SESSION_HOURS` (default 8).
    The user is re-read on every request, so a deleted user or a changed role counts at once.
    `COOKIE_SECURE=true` only when served over HTTPS. `JWT_SECRET`: 32+ characters, required.
  - Sessions on the server (owner, step 11): one row per login in `sessions`. A token counts only
    while its row exists, so:
    - **logout** deletes the row: a copied token gets 401 at once, and the live connections of
      that session are closed at once. The user's other devices stay logged in;
    - a **password change** deletes the user's other rows (logs out the other devices and closes
      their live connections); the device that made the change stays logged in;
    - a deleted user's rows go with it (`ON DELETE CASCADE`); expired rows are deleted at the next
      login.
    Tokens from before step 11 have no session id and stop working: everyone logs in once more.
  - Rate limits per client address: login 10 per minute, sign-up 20 per hour (a kiosk is one
    address for many customers). Behind nginx (step 11) the backend trusts exactly one proxy
    (`TRUST_PROXY=1`, set in docker-compose.yml) and counts the address nginx forwards; nginx
    overwrites `X-Forwarded-For`, so a browser cannot fake it. Without a proxy (`pnpm dev`, the
    default 0) the header is ignored. The backend's own port stays on this computer only.
  - First manager: `MANAGER_EMAIL` / `MANAGER_PASSWORD`, created at startup only if no manager
    exists; never changed afterwards. It starts with a temporary password that must be changed at
    first login (owner, step 9). The flag is set only when the seed creates the account: once any
    manager exists the seed does nothing, so a restart never resets the flag or the password.
  - Validation with the shared zod rules (`packages/shared/src/auth.ts`); a 400 answer lists
    every invalid field. Users are stored through a `UserStore` interface: Prisma 7 client in
    the app, in memory in the HTTP tests (`pnpm test` needs no Docker); `pnpm test:db` runs the
    database tests on a temporary real database.
- Keep customer-facing endpoints (later: orders) in their own module, separate from telemetry and
  control, so the ordering part can be exposed to the internet later without exposing the line.
- `machine`: loads and validates `config/machine.json` with the shared zod schema; serves it at
  `GET /api/machine`. Built in step 6:
  - `machine.json` and both locale files are validated together at startup
    (`loadConfigFiles`); any problem stops the backend listing every issue.
  - `GET /api/locales/:lang` serves `en` or `ar` (404 otherwise): the frontend loads its labels
    from the backend, so a new machine needs only new config files.
  - `GET /api/health` for Docker and monitoring.
  - Access (step 8): `/api/machine` is **manager and worker only** (customers never reach line
    data, doc 03); `/api/locales/*` and `/api/health` are public (the login and sign-up pages
    need the labels).
  - Settings: `PORT` (default 3000), `MACHINE_CONFIG`, `LOCALES_DIR` (defaults: the repo's `config/`).
- NestJS 12 (ES modules). Dependencies are injected with explicit `@Inject(...)` tokens, not with
  emitted type metadata (`emitDecoratorMetadata` is off): tsx and Vitest cannot emit that metadata,
  so explicit tokens make `pnpm dev`, the tests and the build behave the same.
- `telemetry`: subscribes to `lab/mixline/+/sensors/+`, writes to the hypertable, keeps the latest
  value per sensor in memory; the `live` module pushes updates to the frontend over WebSocket.
  `GET /api/telemetry/:sensorId?from&to` for trend charts.
  - **Device clocks are unreliable** (owner, built in steps 7 and 9): the ESP32 has no battery
    clock and the lab is offline. Every reading stores both the device `ts` and the backend's
    `received_at`. Charts use the device `ts`, except when it differs from `received_at` by more
    than a tolerance; then they use `received_at`, and the event is logged. Offline detection
    always uses `received_at` (see `state.ts`).
  - `CLOCK_TOLERANCE_MS` = **2000** (owner), configurable in `.env`.
  - **Robustness:** the backend never crashes on a malformed message (unknown topic, bad JSON,
    wrong unit, unknown code...): it drops the message and continues. This is robustness, not a
    line rule. There is no rejection log, no per-sensor rejection count and no rejections endpoint
    (removed by the owner in step 6); how faults and alarms reach the web app is an open item.
  - Built in step 9:
    - Intake: `MqttIntake` (client id `mixline-backend-<pid>`, QoS 0, reconnects every 2 s) feeds
      `TelemetryIngest`, which accepts only sensor topics of this machine whose payload passes
      `decodeReading()`. Without `MQTT_USERNAME`/`MQTT_PASSWORD` the backend runs without intake
      (warning at startup).
    - The clock rule is applied when reading (SQL `CASE` for history, `chartTime()` for latest),
      so a changed tolerance also applies to stored data. A drifting clock is logged once per
      station when it goes out of tolerance, and once when it is back.
    - Writes: `BatchWriter`, one `INSERT ... SELECT FROM unnest(...)` every 500 ms (or at 1000
      waiting readings). While the database is down, up to 20,000 readings wait in memory (~5 min
      now) and are written when it is back; beyond that the oldest are dropped, with a warning.
    - `GET /api/telemetry/latest`: every sensor heard so far, from memory (`ts` = chart time).
    - `GET /api/telemetry/:sensorId?from&to`: default the last 5 minutes; up to 1 hour from raw
      readings (`{ t, v }`), longer spans up to 7 days from the 1-minute summary
      (`{ t, min, max, avg }`). The summary is real-time (`materialized_only = false`), so it
      includes the newest minutes.
    - Both endpoints: manager and worker only.
    - `pnpm telemetry:check` verifies the live path, including broken messages and a clock
      an hour off.
- `state`: computes ok / warning / fault / offline per component and rolls up to sub-section,
  section, line (generic logic in `shared/state.ts`). The PLC owns all limits and alarms (design
  decision, `docs/01-overview.md`); until PLC alarms are defined, `machine.json` has no limits, so
  a sensor is only `ok` or `offline` (no message received for more than 10 s).
  - Built in step 10: `StateService` recomputes every state every **1 s** from the latest values
    in memory (offline depends on time alone, so new messages are not enough). It keeps the last
    snapshot and reports only what changed (`stateChanges()` in `shared/state.ts`).
  - `GET /api/state`: the last snapshot (`line`, `sections`, `subsections`, `components`,
    `sensors`, each a state by id). Manager and worker only.
- `live` (built in step 10): the push to the web app, **socket.io** at **`/api/socket.io`** on the
  backend's port. The path is under `/api` because the session cookie is sent only there.
  - Access is the same as `/api/telemetry`: managers and workers. It is checked when the connection
    opens (session cookie, user re-read), and again **every 60 s**, because a connection stays open
    for hours: a deleted user, a changed role, a reset password or an expired session is closed
    within a minute. A refused connection gets `connect_error` with a code (`LIVE_REFUSALS` in
    `shared/live.ts`: `LOGIN_REQUIRED`, `PASSWORD_CHANGE_REQUIRED`, `FORBIDDEN`, `UNAVAILABLE`).
    A connection closed by the re-check gets no code; the web app asks `GET /api/auth/me` why.
    If the database is down during a re-check, open connections are kept and checked again a
    minute later.
  - Server to client only (event names and data types in `shared/live.ts`):
    - `snapshot`, once on connect: every latest reading and every state.
    - `readings`, checked every **0.5 s**: only the sensors with a new reading since the last
      batch; nothing is sent when nothing is new. The simulator publishes once a second, so a
      batch comes about every second: about 41 sensors and **4.8 KB** (measured), about
      38 kbit/s per open browser.
    - `states`, checked every 1 s: only the states that changed.
    - A client that starts from the snapshot and applies every `states` event is always exact:
      both come from the same sequence of snapshots.
  - Every staff client gets everything. socket.io rooms per section can be added later if the
    Pi's bandwidth needs it (none are used yet).
  - The session cookie is `SameSite=Strict`, so another site's page cannot open the connection
    with it.
  - nginx and the Vite dev proxy pass WebSocket upgrades on `/api/socket.io` (step 11); without
    that socket.io would fall back to long-polling, which works but is slower.
  - Tests use a real socket.io client against the app (memory stores, no Docker);
    `pnpm live:check` verifies the push on the running stack, including offline pushed with time
    alone (it stops the simulator for about 15 s).

Database:
- `users` (one table for all roles):
  - Account: id, email (unique, stored lowercase), password_hash, role `manager|worker|customer`,
    locale `en|ar`, theme `dark|light` or null (null: follow the browser; owner, step 11),
    created_by (null for self-signup and the seeded manager), created_at.
  - Staff (owner, step 9): department_id (required for workers, null otherwise; foreign key to
    `departments`, ON DELETE RESTRICT), must_change_password (true for accounts a manager creates
    and for the first manager, until the first password change). full_name is required for staff
    too.
- `sessions` (id, user_id, created_at, expires_at), owner, step 11: one row per login; foreign
  key to `users` with ON DELETE CASCADE, indexed by user_id. See "Sessions on the server" above.
- `departments` (id, name_en, name_ar, created_at), owner, step 9: names unique (the database
  indexes exact names; the backend also refuses the same name in another letter case). The
  migration that creates the table inserts Maintenance, Production and Quality, so they exist from
  the first start and are never re-created. A department with workers cannot be deleted (foreign
  key; the API answers 409 with the number of workers).
  - API: `GET /api/departments` (manager and worker: id, names, number of workers);
    `POST /api/departments`, `PATCH /api/departments/:id`, `DELETE /api/departments/:id`
    (managers). A worker's department is set with `departmentId` when the account is created.
  - Sign-up profile. Required for `customer` (enforced by the signup validation); null for staff
    accounts (except full_name):
    - full_name
    - mobile: E.164 string, for example `+963912345678`. The form has a country picker that
      defaults to Syria (+963).
    - date_of_birth (date): at least 18 years before the sign-up date
    - governorate: one of the 14 codes below, or `outside`
    - country: free text, required only when governorate is `outside`
    - city_area: free text (city or area)
    - occupation (optional), paint_purpose (optional, free text)
  - Governorate codes (labels in the locale files as `governorate.<code>`): `damascus`,
    `rifDimashq`, `aleppo`, `homs`, `hama`, `latakia`, `tartus`, `idlib`, `daraa`, `asSuwayda`,
    `quneitra`, `deirEzZor`, `raqqa`, `hasakah`, `outside`.
  - Emails: the database itself refuses capitals (check `users_email_lowercase`), so the unique
    index also means "unique ignoring case". Ids: UUIDs generated by the database. `locale`
    defaults to `en`.
- `telemetry` hypertable (received_at, device_ts, sensor_id, value, source). `received_at` (set by
  the backend) is the hypertable's time column, so partitioning and retention never depend on a
  device clock. Raw data kept **7 days** (retention
  policy). A 1-minute continuous aggregate (min, max, avg) kept **1 year**. Compression after 1 day.
  - Built in step 7: 1-day chunks; one index `(sensor_id, received_at DESC)` for chart queries
    (TimescaleDB's default time-only index is not created); columnstore (TimescaleDB's new name
    for compression) after 1 day, segmented by `sensor_id`.
  - Continuous aggregate `telemetry_1m` (bucket, sensor_id, min, max, avg, samples), bucketed on
    `received_at`, refreshed every minute over the last 3 hours (well inside the 7 days of raw
    data, so no summary loses its source), kept 1 year, compressed after 7 days (owner, step 9;
    segmented by `sensor_id`).
  - Measured in step 9 with one synthetic day in the simulator's pattern: 40.8 readings/s =
    3.5 million a day; raw 506 MB a day uncompressed, 27 MB compressed (19x); raw steady state
    about 1.2 GB at most (7 days, the newest 1-2 uncompressed). The summary grows 14 MB a day
    uncompressed (86,400 rows), hence its compression.
  - Simulator v2 (step 15): about 47 readings/s stored on the running stack (5 Hz while dosing or
    filling), about 15% more than the figures above.
- No `alarms` table in phase 1: its design depends on the PLC alarm list (open item in
  `docs/05-roadmap.md`, owner decision in step 7).
- Migrations: **Prisma 7.10.1** (pinned: the CLI's `latest` npm tag points at an 8.0 release
  candidate). Files in `apps/backend/prisma/`:
  - `schema.prisma`: the plain tables. `telemetry` is listed but excluded from the generated client
    (`@@ignore`): readings have no unique key, and the backend writes them in SQL batches (step 9).
    Listing it keeps Prisma from treating the table as unknown.
  - Migration 1 is generated by Prisma; migration 2 (`*_timescale`) is hand-written SQL for what
    Prisma cannot describe (hypertable, columnstore, retention, continuous aggregate, email check).
    Prisma runs each migration as one transaction, so the aggregate is created `WITH NO DATA`.
  - Verified: `prisma migrate diff` sees no drift, and `prisma migrate dev` after a schema change
    creates a normal migration (no reset demand).
  - `prisma.config.ts` builds the database address from `POSTGRES_*` (host `POSTGRES_HOST`,
    default `localhost`), so the password is written once in `.env`.
  - In Docker, the one-shot `migrate` service applies the migrations and exits; the backend starts
    only after it succeeded. The backend image does not carry the Prisma CLI.
  - pnpm 10 runs install scripts only for `prisma`, `@prisma/engines` and `esbuild`
    (`pnpm-workspace.yaml`), so the migration engine is downloaded when the image is built, never
    when a container starts (the lab is offline).
  - `pnpm db:check` creates an empty database, runs every migration, checks the result (including
    running the cleanup, compression and summary jobs), and removes it.

## Frontend (React)

Built in step 11. `apps/frontend`: Vite 8, React 19, React Router, i18next.

- **One address**: the app calls `/api` on its own address (nginx in Docker, the Vite proxy in
  `pnpm dev` on :5173), so the session cookie goes along by itself and nothing is configured.
- **Labels from the backend** (`GET /api/locales/:lang`), not bundled: a new machine needs only new
  config files. Keys are flat (`part.dyeTank`), so a dot is part of the key. Arabic sets
  `dir="rtl"` on the page; layout uses logical CSS properties, so it mirrors by itself. The one
  text outside the locale files is a bilingual message in `index.html` for when the backend cannot
  be reached before any label loaded.
- **No hardcoded text** (hard rule 6): ESLint `i18next/no-literal-string` rejects text in JSX and in
  the attributes people read (`alt`, `title`, `placeholder`, `label`, `aria-label`). A test runs
  the real ESLint config on two fixtures (one must fail, one must pass).
- **Session**: `GET /api/auth/me` decides who is logged in (the cookie itself is httpOnly). A `401`
  while in use returns to the login page with "your session has ended".
- **Routes and guards** (doc 03): `/login`, `/signup` (visitors), `/change-password`, `/line/*`
  and `/worker` (managers and workers), `/customer` (customers). Managers and workers land on
  `/line`, customers on `/customer`; a page the role may not open sends the user to their own; a
  temporary password allows only `/change-password`. The backend refuses anyway; the guards only
  send people to a page they can use.
- **Language and theme** (owner, step 11): saved with the account (`PATCH /api/auth/me`). Before
  login: the visitor's last language in this browser (else English) and the browser's theme. A
  user who never picked a theme keeps the browser's. During a forced password change the backend
  accepts nothing else, so the language changes only in this browser and the theme is locked.
- **Forms** check the shared zod rules before sending; every message comes from the locale files.
  Mobile: a country picker (the browser's built-in country names, owner step 11; Syria selected
  first), sent as E.164 (`libphonenumber-js`).
- **3D scene** (step 12, `src/scene/`): React Three Fiber 9 (three.js 0.186, drei 10), built from
  `GET /api/machine` at run time; no part is hardcoded.
  - Units: the scene is in metres (machine.json in mm). machine.json's frame (x right, y up, z away
    from the viewer) is left-handed and three.js is right-handed, so the scene flips z and a
    rotation about x or y turns the other way (`frame.ts`); otherwise the line appears mirrored.
  - Each part is a group at its anchor, turned about it (X, Y, Z); boxes, cylinders (axis along
    y), hollow boxes as six walls of `wallThickness`; tanks show their liquid at `level`, or live
    from `levelSource` since step 14 (see "Live data"). Pending parts are see-through placeholders
    with a "Pending" tag. Material colours (`looks.ts`) apply when a part has no `color`.
  - Line page: a part leads to its section; hovering lights up the whole section in brand light
    blue (surfaces and edges), never a state colour. The table and the floor do not react.
  - Camera from the front, a little above; orbit limits: never from below the table, distance
    0.25 to 4 m, panning stays over the table. Renders only when something changes (saves phone
    batteries); no damping when the user asks for reduced motion.
  - The 3D code is a separate file loaded only on line pages (944 kB, 252 kB compressed); a browser
    without WebGL gets a message instead of the scene.
  - Tests: transforms of known parts (table top at y = 0, vessel on its pedestal, the drive roller
    across the belt, the cabinet's six walls, the line not mirrored from the front view), and the
    scene graph without WebGL (`@react-three/test-renderer`): every part present, pending parts
    see-through, liquids coloured, hover lights exactly one section.
- **Navigation** (step 13, `src/navigation/`): the four levels of doc 03, one page each, with its
  own address (`/line`, `/line/:section`, `/line/:section/:subsection`, `.../:part`,
  `/line/:section/part/:part`). `places.ts` is plain data and says, for each page, which parts it
  shows, where clicking each leads, the breadcrumbs, and which boxes are see-through:
  - line: a part leads to its section; section: to its sub-section, or its own page when it has
    none (the cabinet: level 3 skipped); sub-section: to each part; part: shows the parts grouped
    under it, each leading to its own page.
  - Below the line page only the subject is drawn, with the table (and on a part's page the box
    around it) as a faint ghost that never reacts.
  - A closed box is see-through, with thin edge lines, when the page offers its inside parts
    separately or is about the box or one of them (owner, step 12); it then lets a click through
    to the part behind its wall.
  - Mouse: hover lights everything leading to the same page and shows that page's name; a click
    opens it; a drag (more than 6 px) only turns the view. Touch: the first tap shows the name,
    the second opens it.
  - The camera frames each page from the line view's direction and glides to it in 0.7 s (a jump
    on first show and with reduced motion).
  - Breadcrumbs in the header (doc 06), the current page as the title. A list beside the view
    (below it on phones) holds the same links, so every page is reachable without 3D; on a part's
    page it shows status, the box it belongs to, the parts inside, the sensors' live values and
    charts (step 14), and the places kept for the digital twin.
  - Tests: every section, sub-section and part has an address and is reachable by clicks from
    `/line`; targets per level; see-through rule; framing fits on wide screens and phones; clicks,
    drags, taps and the click-through in the scene graph; the pages in the app (breadcrumbs, list,
    unknown addresses).
- **Live data** (step 14, `src/live/`): one socket.io connection while a line page is open
  (`LiveProvider`): the snapshot, then batches of readings and state changes. Status connecting /
  live / reconnecting (a "Live data paused" notice while values may be old).
  - For the charts: `subscribe` hands every batch to whoever listens (charts keep all readings,
    not only the latest); `reconnects` counts returns after a loss (charts then reload their
    history); `clockOffset` is the server's clock minus the browser's, from each batch's newest
    `receivedAt` (at most about 0.5 s behind, since a batch leaves up to 0.5 s later). Lab
    computers may have a wrong clock (no internet), and charts use it for "now".
  - In the scene: state colours on parts (`scene/looks.ts`, offline grey; one pulse on a change in
    `scene/Part.tsx`);
    liquid levels from `levelSource`, the mix colour from the camera's L\*a\*b\* with a D65 white
    (`scene/liquid.ts`). State chips in the list beside the view (`live/StateChip.tsx`).
  - Values on a part's page (`live/SensorValues.tsx`, rules in `live/format.ts`): Western digits,
    each analog sensor's `decimals`, no thousands separator; words for digital and enum codes;
    units as machine.json spells them, `C` shown as `°C`, none for `count`, `raw`, `bool` and
    unitless values; the time as HH:MM:SS in the browser's time zone; a "Simulated" tag; an
    offline sensor keeps its last value, dimmed. The twin's places are in `src/twin/`.
  - The SIMULATION badge (`live/SimulationBadge.tsx`) fills the header's "status" place
    (`layout/headerSlot.tsx`): sensors whose latest reading is `sim`, out of all in machine.json.
- **Trend charts** (step 14, `src/chart/`): our own SVG, no chart library: testable in jsdom (a
  canvas is not), coloured by the theme tokens, light for phones. Doc 03 has the owner's rules
  (timelines, neutral greys, left to right, one remembered window).
  - Data (`useSeries.ts`): `GET /api/telemetry/:sensorId` for the window plus 10 s (at most an
    hour, so the backend sends raw readings), then every live batch added at the right. Loaded
    again on a window change, after a reconnect and on "Try again"; the previous chart stays,
    dimmed, meanwhile. Readings that arrive during a load are kept and added after it.
  - Rules (`series.ts`, pure functions): a value holds until the next reading, at most 10 s (the
    offline rule); a longer silence breaks the line and leaves the timeline empty. A line keeps at
    most two points (lowest, highest) per column of 300, so an hour at 5 Hz stays light.
  - Limit: the live push carries each sensor's latest value per 0.5 s, so the live end of a 5 Hz
    line is coarser than its history (a reload has every reading).
  - One 1 s timer for every chart (`clock.ts`); the window in `localStorage`
    (`mixline.chartWindow`); timeline shades `--band-1…4` (`shades.ts`, code 0 the faintest).
- **Brand** (docs/06-brand.md): colour tokens in `src/styles/tokens.css` with a WCAG AA test; IBM
  Plex Sans, Sans Arabic and Mono bundled (the lab is offline); the SVG mark in `src/brand/Logo.tsx`.
- **nginx** (`docker/web.Dockerfile`, `docker/nginx/default.conf`; `nginx-unprivileged`, runs as a
  normal user, multi-arch): `/api` and the WebSocket to `backend:3000` (re-resolved every 10 s,
  so a recreated backend container is followed); any other address gets `index.html` (deep
  links); `/assets/*` cached for a year (file names change with every build); `nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`.
- Tests: the app against a fake backend and a fake live connection (Testing Library, jsdom), with
  the real locale files and machine.json; step 14 adds the values panel, the charts (history
  spans, the window switch, live additions, reload after a reconnect, failure and "Try again",
  gaps, timeline shades and words, the keyboard readout, Arabic left to right), the badge, and
  token tests (band and badge contrast, no state colours in charts, violet only in the badge).
  `pnpm web:check` checks the running stack through nginx: page, deep links, caching, API, login,
  WebSocket, and that logout closes the session's live connection at once.

## Simulator

- Reads `machine.json`, publishes every sensor on its real topic.
- v1 (step 5): every sensor at its `sim.nominal`; analog values get small noise (0.5% of the sim
  range) but never cross a limit, so the line shows ok. Units `count` and `steps` stay whole
  numbers. Since v2, only sensors outside the sensor table still behave like this.
- v2 (step 15): a looping batch, so values move the way the real parts will. Built in step 15:
  - **Tuning file** `config/simulator.json` (owner: apart from `machine.json`): the recipes, the
    dye strengths of the colour model, flow rates, timings, supply sizes. Every number is an
    estimate; a strict schema checks it at start-up (`simConfig.ts`).
  - **Recipes** (owner): 5 colours in turn, green, orange, violet, brown, grey, each with all
    four dyes, in grams of dye per kg of base. The target colour is what the colour model
    predicts for the recipe.
  - **Sensor table** (owner: option a, `bindings.ts`): which `machine.json` sensor and part plays
    which role in the process ("the vessel scale is `vessel.mass`"). Checked against
    `machine.json` at start-up (kind, unit, value words, conveyor stations one equal pitch apart,
    supplies inside the sim ranges); the simulator refuses to start and names every problem.
    Topics, units and ranges still come from `machine.json`. A sensor not in the table keeps v1.
  - **Mass record** (`ledger.ts`): where every gram is and what it is made of (water and each
    dye): big tank, dye tanks, vessel, sample cell, each cup, tray, reject box, drain bucket.
    Liquid only moves from place to place; refills and emptying go through "outside". The sum
    over all places never changes, so the scales balance by construction.
  - **The batch** (`batch.ts`, a stand-in for the PLC sequence, doc 01): 800 g of base with 85%
    of the recipe's dye (light side first), mix, sample, up to 2 corrections, complete to
    6 × 300 g + 200 g heel in the same ratios, mix, final check, fill 6 cups on the indexing belt
    (feeder, filling by weight, check, lid or reject, tray), then drain and rinse twice until
    the camera sees clear water. About 4 minutes (owner), plus a 5 s pause.
  - **Rejects** (owner): about 1 cup in 20 is filled short by 8 to 15 g, so the check station
    pushes it to the reject box. All random choices come from one seeded generator, so tests
    are repeatable.
  - **Colour model** (owner): Beer–Lambert per red, green and blue channel (`shared/color.ts`),
    white-balanced on clear water, converted to L*a*b* with white D65; ΔE is CIEDE2000, checked
    against its published test data; tolerance ΔE00 ≤ 2.0. Each dye lot (every dye refill) is
    up to 6% weaker or stronger than the model, so the first sample is never exactly right.
  - **Correction** (`correction.ts`): in absorbance, where dyes add up: the missing absorbance is
    covered with more of the recipe in its own ratios, then any hue left with the least extra
    dye (non-negative least squares); 95% of it is dosed, so the colour is approached from the
    light side.
  - **Between batches** (owner): as if by a worker, the full tray is removed, and any supply that
    cannot cover the next batch is refilled to full (big tank, dye tanks with a new lot, cups,
    lids) or emptied (drain bucket, reject box). One `batch/refill` message lists it all. The
    simulator never lets a supply run out, so it never trips a float: alarms belong to the PLC.
  - **Fault hook** (`Faults` in `plant.ts`): a worn dye pump (less per step), a weak dye, a
    drifting scale. Not used in phase 1; a test shows a worn pump needs more steps for the same
    colour while the vessel scale sees less than was commanded (the research idea, doc 01).
  - Placeholders until the PLC defines them: stack light green while a batch runs and yellow
    between batches; mode auto; e-stop released.
- Rates: analog 1 Hz, 5 Hz while dosing or filling (see the publishing rules above); digital and
  enum on change plus the 5 s heartbeat. The simulation steps every 200 ms, so short pulses (the
  tray sensor, the feeder fingers) are never missed. About 47 readings a second on average
  (measured on the stack).
- MQTT: client id `mixline-simulator`, QoS 0 for readings (only the latest value matters; a lost
  reading is replaced a second later), QoS 1 for the state (retained) and batch messages,
  automatic reconnect every 2 s, and every sensor and the state are sent again right after a
  (re)connect. Every message passes the shared schemas before it is sent.
- Settings: `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MACHINE_CONFIG` and `SIMULATOR_CONFIG`
  (defaults: the repo's `config/machine.json` and `config/simulator.json`; in Docker
  `/config/...`, mounted read-only from `./config`).
- `pnpm sim:check` listens 12 s and verifies all topics, payloads, source `sim`, intervals (at
  most 5 Hz), the retained machine state and the batch message formats.
- `pnpm sim:check --cycle` waits for the next batch and hears it from start to finish (about
  5 minutes, at most 11), then checks from the published values only: steps in order,
  6 containers, final ΔE, clear rinse water, and that masses balance across the scales (dye
  tank drop = vessel gain = steps × g/step; vessel drop = filling scale = check scale; big tank
  level drop = vessel gain), and that the refill after it takes the cups that passed. MQTT only,
  no login (`cycle.ts`).
- Tests: the tuning file, the sensor table against `machine.json`, the mass record, the colour
  correction for every recipe, whole batches in fast time with a fixed seed (steps, 6 cups,
  about 4 minutes, ΔE, formats, the mass balance at every step, refills and rejects over 20
  batches, rates, the fault hook), and the cycle check on simulated batches and on tampered ones.

## Workspace packages and images

- `@mixline/shared/node` (Node only): `loadMachineFile`, `loadConfigFiles` read and validate the
  config files; the main `@mixline/shared` entry has no file-system code, for the browser.
- `@mixline/shared` exports a `source` condition: in development, TypeScript (`customConditions`),
  Vitest and tsx (`--conditions=source`) read its `.ts` files directly, so no build is needed
  between edits. Production builds (`tsconfig.build.json`) and images use its `dist/`.
- `.pnpmfile.cjs` removes two *optional* peer links from `@prisma/client` (the Prisma CLI and
  TypeScript). pnpm linked them because both are installed as dev tools, and `pnpm deploy --prod`
  then put them, with Prisma Studio and an embedded Postgres, into the backend image (481 MB ->
  266 MB without them). The runtime client needs neither.
- The web app has its own `docker/web.Dockerfile` (Vite build, then nginx); see "Frontend".
  Its build type-checks the app code only (`tsconfig.build.json`): the tests read `config/`, which
  is not in the Docker build context. `pnpm typecheck` still checks the tests.
- App images: one multi-stage `docker/node-app.Dockerfile` for every Node app (build argument
  `APP`: `backend`, `simulator`), build context = `web-app/`, base image pinned
  (`node:24.22.0-alpine3.24`, multi-arch). The runtime stage holds only the app's `dist/` and
  production dependencies (`pnpm deploy`), runs as the unprivileged `node` user, and gets
  `config/` mounted read-only. `.dockerignore` keeps `.env`, `node_modules` and docs out.

## Shared package

- `machine.schema.ts`: zod 4 schema for `machine.json` + inferred types. Every object is strict
  (unknown keys are errors). Also checks one-item rules: digital = unit `bool`, mass sensors
  `measures: netLiquid`, every digital/enum code has a value label, fault limits beyond warn limits,
  rotated parts use `anchor: center`.
- `machine.rules.ts`: cross-checks between items: unique ids, unique `(station, variable)`,
  references (section, subsection, parent on the same page, `levelSource`, `liquids.mix.source`).
  `part` is reserved as a subsection id because component URLs use it (see doc 03 routes).
- `locales.ts`: locale schema, `translate()` (param key first, then interpolate), and the locale
  rules: same keys and placeholders in `en`/`ar`, every used key exists, unique names per page.
- `validate.ts`: `validateMachine(data, locales?)` returns every issue at once;
  `parseMachineOrThrow()` for app startup. Issue paths use ids, e.g.
  `components[checkPlatform].sensors[check.decision].valueLabels`.
- The shared code never reads files, so the browser can use it too; apps load the files.
- `topics.ts`: builders for the five topic forms, subscription patterns, `parseTopic()` (rejects
  anything else), `sensorsByTopic()` (topic -> sensor, for ingest).
- `telemetry.ts`: payload schemas for readings, `state` and `batch/<event>`, all strict.
  - Timestamps are UTC ISO 8601 with `Z` (no local offsets).
  - `batchId` in `state` may be `null` only while no batch runs (not `running` or `paused`).
  - `decodeReading()` rejects a reading whose unit differs from `machine.json`, a digital value
    other than 0/1, or an enum code without a value word.
- `state.ts`: state from limits and roll-up (doc 03 ranking). Generic: the real `machine.json` has
  no limits for now (the PLC owns them), so its tests use made-up test limits from the fixtures.
  - Limits are strict: a value exactly at a limit is OK (`warnBelow: 150` warns at 149.9).
  - Offline = no message received for more than 10 s, measured from when the backend
    **received** the message, not from its `ts` (device clocks in an offline lab can be wrong).
  - Parts without sensors are `none`. Parents do not take their children's state (grouping only);
    sub-section, section and line roll up along the page tree.

## machine.json shape

The zod schema in `packages/shared` follows `config/machine.json` exactly. If the file and this
section ever disagree, the file wins; update this section.

```jsonc
{
  "schemaVersion": 1,
  "liquids": {
    "base": { "hex", "opacity", "notes" },
    "mix":  { "hex", "opacity", "source": ["sensor id L*", "sensor id a*", "sensor id b*"], "notes" }
  },
  "site": "lab",
  "machine": "mixline",
  "units": { "length": "mm", "mass": "g" },
  "frame": { "origin", "x", "y", "z", "position", "cylinderAxis" },   // descriptive strings
  "table": { "width", "depth", "heightToFloor", "status" },
  "container": { "status", "shape", "topDiameter", "baseDiameter", "height", "lid",
                 "fillTargetG", "perBatch", "material", "tareG", "notes" },
  "conveyor": { "centerlineZ", "surfaceY", "startX", "endX", "beltWidth", "beltGap", "status",
                "stations": [ { "id", "x" } ] },
  "sections": [ { "id", "labelKey", "subsections": [ { "id", "labelKey" } ] } ],
  "components": [ {
    "id": "string, unique",
    "type": "string",
    "labelKey": "i18n key",
    "labelParams": { "color": "i18n key" },               // optional
    "section": "section id | null",                       // null = scene only (table)
    "subsection": "subsection id | null",                 // null = shown on the section page
    "parent": "component id",                             // optional, grouping only
    "status": "confirmed | estimated | pending",
    "anchor": "bottom | center",
    "position": [x, y, z],
    "rotationDeg": [x, y, z],
    "geometry":
        { "shape": "box", "size": [x, y, z], "hollow"?: true, "wallThickness"?: number }
      | { "shape": "cylinder", "diameter", "height",
          "liquid"?: { ("colorRef": "base | mix") | ("colorHex": "#rrggbb"),
                       "level": 0..1,                                   // fallback
                       "levelSource": { "sensor", "min", "max" } } },   // level = clamp((v-min)/(max-min))
    "material": "wood | clearPlastic | plastic | metal | acrylic | printed | electronics | rubber",
    "color": "#rrggbb",                                   // optional
    "notes": "string",                                    // optional
    "sensors": [ {
      "id": "string, unique",
      "station": "MQTT station segment",
      "variable": "MQTT variable segment",
      "unit": "string ('' for unitless, 'bool' for digital)",
      "kind": "analog | digital | enum",
      "labelKey": "i18n key",
      "valueLabels": { "0": "i18n key", "1": "i18n key" },   // digital and enum only
      "decimals": 0..6,                                     // analog only, required (owner, step 14): digits after the point
      "measures": "netLiquid",                              // mass sensors only
      "sim": { "min", "max", "nominal" },                 // optional
      "limits": {                     // optional, any subset; unused for now (PLC owns limits)
        "warnBelow", "faultBelow", "warnAbove", "faultAbove",   // analog
        "warnWhen", "faultWhen"                                 // digital / enum value
      }
    } ]
  } ]
}
```

State from limits (when limits exist): `fault*` beats `warn*`. No message received for more than
10 s = `offline`. For now `machine.json` has no limits, so a sensor is only `ok` or `offline`.
`(station, variable)` pairs are unique across the file, so every topic maps to one sensor.
On any one page, the translated name (`labelKey` + `labelParams`) of every component is unique.
Add a test in `packages/shared` that checks both rules and that every `labelKey` exists in both locale files.
