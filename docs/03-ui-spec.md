# 03 — UI Specification

## Users and roles

- Own auth system (no third-party login): email + password, password hashed (argon2 or bcrypt),
  JWT. Reason: the line runs on a local lab network and must work without internet; third-party
  login providers may also block users in Syria.
- Three roles from day one:

| Role | Who | How the account is created | Phase 1 |
|---|---|---|---|
| `manager` | runs the line | first one seeded from env; managers can create managers and workers (page built as the **last** step of phase 1) | full interface |
| `worker` | operates the line | created by a manager | placeholder page |
| `customer` | orders a color and quantity | **self-registration** (public sign-up page creates `customer` only) | placeholder page |

- Customer sign-up fields:
  - Required: full name, email, mobile number, password, date of birth, location.
  - Optional: occupation, and what they need the paint for (free text).
  - Mobile: international E.164 format, with a country picker that defaults to Syria (+963).
    Stored as E.164.
  - Location: a required dropdown of the 14 Syrian governorates plus "Outside Syria", and a
    required free-text city / area field. "Outside Syria" adds a required free-text country field.
  - Storage: see `users` in `docs/04-architecture.md`.
- Self-registration can never create `manager` or `worker`. Enforce in the backend, not only the UI.
- Customers order from two places (later phase):
  1. A kiosk screen next to the line (local network).
  2. Their own phone from home (internet). See the open item in `docs/05-roadmap.md`.
- A customer must never reach line monitoring, telemetry or control endpoints. Role guards on both
  backend and frontend.
- Phase 1 builds the **manager** interface only. Worker and customer routes exist as protected
  routes with an empty "coming soon" page. The sign-up page for customers is built in phase 1.
- Manager actions (start batch, recipes, control) are **not defined yet**. Phase 1 is monitoring only.

## Navigation: four levels, each level is its own page

Clicking an object navigates to a **separate page** that shows only that part in more detail.
Every level has its own URL so it can be bookmarked and shared. Breadcrumbs on every page.

| Level | Page | Shows | Clicking opens |
|---|---|---|---|
| 1 | Line | The whole line in 3D | A section (level 2) |
| 2 | Section | One section in 3D | A sub-section (level 3) |
| 3 | Sub-section | One sub-section in 3D | A component (level 4) |
| 4 | Component | One part, close up, with its values | — |

Section tree (generated from `machine.json`):

```
Line
├── Supply
│   ├── Big base tank
│   └── Empty container magazine
├── Mixing & Color
│   ├── Mixing      (vessel, scale, mixer, dye shelf, dye tanks + scales, dye pumps, base pump, drain pump)
│   └── Color       (camera box: camera, sample cell, holder, diffuser, LEDs; sample pump)
├── Conveyor
│   ├── Feeder
│   ├── Filling
│   ├── Check + Reject + Cap
│   └── Batch tray
└── Control cabinet
```

When a section has no sub-sections, level 3 is skipped and its components open directly.
Components with `subsection: null` (for example conveyor rollers, belts and frame) are shown and
clickable on their section page. The `table` has no section and is scene-only, not clickable.
Components with a `parent` (for example the camera inside the color box) are drawn relative to the
same world coordinates but grouped under the parent on component lists.

Suggested routes:
```
/line
/line/:sectionId
/line/:sectionId/:subsectionId
/line/:sectionId/:subsectionId/:componentId
/line/:sectionId/part/:componentId   (parts with subsection: null; "part" is a reserved id)
/worker            (placeholder)
/customer          (placeholder)
/login
/signup            (customers only)
/users             (managers only, built last in phase 1)
```

## 3D scene rules

- Built from `machine.json` at runtime. No hardcoded parts.
- Simple primitives only. Transparent containers show their liquid level and color.
- Orbit camera with limits (no going under the table). Each page frames its own subject.
- Hover highlights an object and shows its name. Click navigates.
- `pending` parts render as a translucent placeholder with a "pending" tag.
- Black dye is shown active like the other three.

## State colors (must be visible without clicking)

| State | Look | Rank in roll-up |
|---|---|---|
| fault | red outline / glow | 1 (worst) |
| warning | yellow outline / glow | 2 |
| offline | grey, dimmed (no data for 10 s) | 3 |
| ok | normal colors | 4 |
| none | normal colors, no badge (part has no sensors) | not counted |

- **Who decides warning and fault: the PLC** (design decision, `docs/01-overview.md`). The web app
  only displays what the PLC reports. Until the PLC alarm list and how alarms reach the web app are
  defined (open item in `docs/05-roadmap.md`), `machine.json` has no limits, so a sensor is only
  `ok` or `offline`. The warning and fault looks below stay in the design for when alarms arrive.
- A component's state is the worst state of its sensors.
- A parent (sub-section, section, line) shows the worst state of its children, ignoring `none`.
- `pending` is not a state, it is a look: a pending part is translucent with a "pending" tag. If a
  pending part's sensor is in warning or fault, it stays translucent **and** shows the warning/fault
  outline. A fault must always be visible.
- Liquid levels in tanks and the vessel follow live data (`liquid.levelSource`), not a fixed value.

## Component page (level 4)

- Close-up 3D view of the part.
- Live values panel: each sensor with value, unit and timestamp, updating over WebSocket.
- A small live trend chart per sensor (last few minutes).
- Reserved, empty slots for later twin features: Predicted value, Residual, Health index, Remaining
  useful life. Show them as disabled with "coming later" so the layout does not change later.

## Simulated data

Phase 1 runs on the simulator (see `docs/04-architecture.md`). Show a clear "SIMULATION" badge in the
header while the data source is the simulator.

## Languages

- English and Arabic, switchable at runtime, remembered per user.
- Arabic switches the layout to RTL. The 3D scene does not mirror.
- All labels come from translation files keyed by component / section `labelKey`.
- Full translations for every key are in `config/locales/en.json` and `config/locales/ar.json`.
  The frontend loads these; add new keys to both files.
- Some keys take parameters (`labelParams` in `machine.json`), for example
  `part.dyeTank` = "{{color}} dye tank" with `color` = `color.cyan`. Translate the param key first,
  then interpolate.

Number and unit display:
- Digits are Western (0-9) in both languages.
- Units stay in English (g, mm, rpm, A). Technical terms like L*, a*, b*, ΔE stay as they are.
- Sensor names come from each sensor's `labelKey`. Digital and enum values are never shown as raw
  numbers: use `valueLabels` (for example `check.decision` 2 = `value.reject`).

Default language on first visit: **English**. After that, the user's saved choice.

## Devices

Desktop, tablet and phone. Responsive layout. On phones the values panel stacks under the 3D view.
Keep the scene light enough for a mid-range phone.
