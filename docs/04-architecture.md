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
- Commands: `pnpm infra:up` (start and wait until healthy), `pnpm infra:check` (verify),
  `pnpm infra:down` (stop; data volumes are kept).

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
  `GET /api/machine`.
- `telemetry`: subscribes to `lab/mixline/+/sensors/+`, writes to the hypertable, keeps the latest
  value per sensor in memory, pushes updates to the frontend over WebSocket.
  `GET /api/telemetry/:sensorId?from&to` for trend charts.
- `state`: computes ok / warning / fault / offline per component from limits in `machine.json`
  and from data age (offline if no data for N seconds); rolls up to sub-section, section, line.

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
- `telemetry` hypertable (time, sensor_id, value, source). Raw data kept **7 days** (retention
  policy). A 1-minute continuous aggregate (min, max, avg) kept **1 year**. Compression after 1 day.
- `alarms` (id, component_id, level, message, raised_at, acked_at) — table now, UI later
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
- `state.ts`: state from limits and roll-up (doc 03 ranking).
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
      "limits": {                                         // optional, any subset
        "warnBelow", "faultBelow", "warnAbove", "faultAbove",   // analog
        "warnWhen", "faultWhen"                                 // digital / enum value
      }
    } ]
  } ]
}
```

State from limits: `fault*` beats `warn*`. No message received for more than 10 s = `offline`.
`(station, variable)` pairs are unique across the file, so every topic maps to one sensor.
On any one page, the translated name (`labelKey` + `labelParams`) of every component is unique.
Add a test in `packages/shared` that checks both rules and that every `labelKey` exists in both locale files.
