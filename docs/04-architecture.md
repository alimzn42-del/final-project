# 04 — Architecture

## Services (docker-compose)

| Service | Image / app | Role |
|---|---|---|
| `db` | `timescale/timescaledb:2.30.2-pg16` (PostgreSQL 16) | users, config, telemetry hypertable |
| `mqtt` | `eclipse-mosquitto:2.0.22` | message broker |
| `backend` | `apps/backend` (NestJS) | REST, auth, MQTT ingest, WebSocket push |
| `frontend` | `apps/frontend` (Vite build served by nginx) | the web app |
| `simulator` | `apps/simulator` (Node) | publishes fake telemetry |

- All images must have arm64 builds (Raspberry Pi 5 later). Runs on a laptop for now.
  Third-party images are pinned to exact versions (both above are multi-arch, arm64 included).
- Config through env vars; commit `.env.example` only.
- Named volumes for db and broker data.
- Host ports are bound to `127.0.0.1` only (local tools); services reach each other by service
  name on the Compose network.
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

`source` is `sim` or `hw`. The frontend shows the SIMULATION badge when data is `sim`.
`value` is always a number. Digital: 1/0. Enum: the integer code listed in the sensor's `valueLabels`.

Publishing rules (simulator now, hardware later):
- Analog sensors: on a fixed timer (1 Hz idle, up to 5 Hz while dosing or filling).
- Digital and enum sensors: on change, plus a heartbeat every 5 s.
- A sensor with no message for 10 s is `offline`.
- Scales publish **net liquid mass** in grams. The vessel and dye scales are tared with the empty
  vessel/tank. Filling and check scales subtract `container.tareG`.
- `bigTank.level` is the liquid height above the tank bottom in mm.

Machine-wide messages (published from simulator v2, step 15):

`lab/mixline/state` (retained):
```json
{ "ts": "...", "mode": "auto", "status": "running", "batchId": "B-0012", "source": "sim" }
```
- `mode`: `auto | manual`. `status`: `idle | running | paused | stopped | fault`.

`lab/mixline/batch/<event>`, event one of `started | step | finished | aborted`:
```json
{ "ts": "...", "batchId": "B-0012", "step": "dyeDose", "recipe": { "targetLab": [55, 10, -20] },
  "containersDone": 3, "source": "sim" }
```
- `step` one of: `baseFill, dyeDose, mix, sample, correct, complete, finalCheck, filling, rinse`.

Topic builders and the payload zod schema live in `packages/shared`.

## Backend (NestJS)

Modules:
- `auth`: own auth (no third-party providers). Login, JWT, roles `manager` / `worker` / `customer`,
  guards. Seed one manager user from env. `POST /api/auth/signup` always creates a `customer`.
  Managers create `manager` and `worker` accounts through a protected endpoint.
  Rate-limit login and signup.
- Keep customer-facing endpoints (later: orders) in their own module, separate from telemetry and
  control, so the ordering part can be exposed to the internet later without exposing the line.
- `machine`: loads and validates `config/machine.json` with the shared zod schema; serves it at
  `GET /api/machine`. Built in step 6:
  - `machine.json` and both locale files are validated together at startup
    (`loadConfigFiles`); any problem stops the backend listing every issue.
  - `GET /api/locales/:lang` serves `en` or `ar` (404 otherwise): the frontend loads its labels
    from the backend, so a new machine needs only new config files.
  - `GET /api/health` for Docker and monitoring.
  - These routes are public until auth (step 8) decides which roles may call them.
  - Settings: `PORT` (default 3000), `MACHINE_CONFIG`, `LOCALES_DIR` (defaults: the repo's `config/`).
- NestJS 12 (ES modules). Dependencies are injected with explicit `@Inject(...)` tokens, not with
  emitted type metadata (`emitDecoratorMetadata` is off): tsx and Vitest cannot emit that metadata,
  so explicit tokens make `pnpm dev`, the tests and the build behave the same.
- `telemetry`: subscribes to `lab/mixline/+/sensors/+`, writes to the hypertable, keeps the latest
  value per sensor in memory, pushes updates to the frontend over WebSocket.
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
- `state`: computes ok / warning / fault / offline per component and rolls up to sub-section,
  section, line (generic logic in `shared/state.ts`). The PLC owns all limits and alarms (design
  decision, `docs/01-overview.md`); until PLC alarms are defined, `machine.json` has no limits, so
  a sensor is only `ok` or `offline` (no message received for more than 10 s).

Database:
- `users` (one table for all roles):
  - Account: id, email (unique, stored lowercase), password_hash, role `manager|worker|customer`,
    locale `en|ar`, created_by (null for self-signup and the seeded manager), created_at.
  - Sign-up profile. Required for `customer` (enforced by the signup validation); null for staff
    accounts unless decided otherwise:
    - full_name
    - mobile: E.164 string, for example `+963912345678`. The form has a country picker that
      defaults to Syria (+963).
    - date_of_birth (date)
    - governorate: one of the 14 codes below, or `outside`
    - country: free text, required only when governorate is `outside`
    - city_area: free text (city or area)
    - occupation (optional), paint_purpose (optional, free text)
  - Governorate codes (labels in the locale files as `governorate.<code>`): `damascus`,
    `rifDimashq`, `aleppo`, `homs`, `hama`, `latakia`, `tartus`, `idlib`, `daraa`, `asSuwayda`,
    `quneitra`, `deirEzZor`, `raqqa`, `hasakah`, `outside`.
- `telemetry` hypertable (received_at, device_ts, sensor_id, value, source). `received_at` (set by
  the backend) is the hypertable's time column, so partitioning and retention never depend on a
  device clock. Raw data kept **7 days** (retention
  policy). A 1-minute continuous aggregate (min, max, avg) kept **1 year**. Compression after 1 day.
- No `alarms` table in phase 1: its design depends on the PLC alarm list (open item in
  `docs/05-roadmap.md`, owner decision in step 7).
- Migrations in code (Prisma or TypeORM; Timescale hypertable created in a raw SQL migration).

## Simulator

- Reads `machine.json`, publishes every sensor on its real topic.
- Runs a simple looping batch so values move in a believable way: base fill, dye doses, mixing,
  sample in and out, color reading, filling 6 containers, check, cap, container arrives in the tray,
  optional rinse. One simulated batch takes about 3 minutes.
- Masses must balance: dye scale drops by what the vessel gains; the vessel drops by what each
  container gains.
- Rates: about 1 Hz idle, up to 5 Hz during dosing / filling.
- Uses each sensor's `sim` block (`min`, `max`, `nominal`) from `machine.json`.
- Has a hook to inject faults later (worn pump, weak dye, scale drift). Not needed in phase 1.
- v1 (step 5): every sensor at its `sim.nominal`; analog values get small noise (0.5% of the sim
  range) but never cross a limit, so the line shows ok. Units `count` and `steps` stay whole
  numbers. The batch above is v2 (step 15).
- MQTT: client id `mixline-simulator`, QoS 0 for readings (only the latest value matters; a lost
  reading is replaced a second later), automatic reconnect every 2 s, and every sensor is sent
  again right after a (re)connect. Every message passes `decodeReading()` before it is sent.
- Settings: `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MACHINE_CONFIG` (default: the repo's
  `config/machine.json`; in Docker `/config/machine.json`, mounted read-only from `./config`).
- `pnpm sim:check` listens 12 s and verifies all topics, payloads, source `sim` and intervals.

## Workspace packages and images

- `@mixline/shared/node` (Node only): `loadMachineFile`, `loadConfigFiles` read and validate the
  config files; the main `@mixline/shared` entry has no file-system code, for the browser.
- `@mixline/shared` exports a `source` condition: in development, TypeScript (`customConditions`),
  Vitest and tsx (`--conditions=source`) read its `.ts` files directly, so no build is needed
  between edits. Production builds (`tsconfig.build.json`) and images use its `dist/`.
- App images: one multi-stage `docker/node-app.Dockerfile` for every Node app (build argument
  `APP`: `backend`, `simulator`), build context = repo root, base image pinned
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
