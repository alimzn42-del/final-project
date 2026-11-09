# 03 — UI Specification

## Users and roles

- Own auth system (no third-party login): email + password, password hashed (argon2 or bcrypt),
  JWT. Reason: the line runs on a local lab network and must work without internet; third-party
  login providers may also block users in Syria.
- Three roles from day one:

| Role | Who | How the account is created | Phase 1 |
|---|---|---|---|
| `manager` | runs the line | first one seeded from env; managers can create managers and workers (page built as the **last** step of phase 1) | full interface |
| `worker` | operates the line | created by a manager | line pages (monitoring), like a manager; own tools page is a placeholder |
| `customer` | orders a color and quantity | **self-registration** (public sign-up page creates `customer` only) | placeholder page |

- Customer sign-up fields:
  - Required: full name, email, mobile number, password, date of birth, location.
  - Age: at least **18 years old on the sign-up date** (date in Syria, Asia/Damascus). Enforced in
    the shared sign-up rules, which the backend applies to every sign-up (owner, step 9).
  - Optional: occupation, and what they need the paint for (free text).
  - Mobile: international E.164 format, with a country picker that defaults to Syria (+963).
    Stored as E.164.
  - Location: a required dropdown of the 14 Syrian governorates plus "Outside Syria", and a
    required free-text city / area field. "Outside Syria" adds a required free-text country field.
  - Storage: see `users` in `docs/04-architecture.md`.
- Self-registration can never create `manager` or `worker`. Enforce in the backend, not only the UI.
- Managers manage staff accounts on the users page (owner, step 16): managers and workers only,
  customers later in their own section. Besides creating accounts, a manager can move a worker
  to another department, give someone a new temporary password (they must change it at the next
  login) and disable or re-enable an account. A new temporary password and disabling log that
  person out everywhere at once. No deleting and no role change for now.
  - A manager can never disable their own account, and the line can never be left without an
    active manager; the backend refuses both, whatever the page sends.
  - A disabled person who logs in with the right password is told the account is disabled and to
    ask a manager; a wrong password always gets the plain "wrong email or password".
  - Every change to an account or a department is recorded in the audit log (who, on whom,
    before, after, when). Viewing it is deferred (doc 05).
- A manager creates a worker or manager account with (owner, step 9):
  - Required: full name, email, role, a **temporary password**. Optional: language.
  - Workers also need a **department** (required).
- Departments (owner, step 9) are kept in the database, not in a config file:
  - Maintenance (الصيانة), Production (الإنتاج) and Quality (الجودة) are created once, on first
    start; deleting them later never brings them back.
  - Managers add, rename and delete departments (API now, the user-management page later). Each
    department has an English and an Arabic name, both required, unique ignoring letter case.
    They are data typed by a manager, so they are not in the locale files.
  - A department that still has workers **cannot be deleted**: the answer gives the number of
    workers, and the database enforces it too (foreign key).
  - The new user **must change the password at first login**: until then the account can only see
    who is logged in, change its password, or log out. The same applies to the first manager
    created from `.env` (set once, at creation; a restart never resets it).
  - Later, the department will decide which sections a worker can open; for now every worker can
    open every section (open item in `docs/05-roadmap.md`).
- Customers order from two places (later phase):
  1. A kiosk screen next to the line (local network). It is **one shared device**: an 8-hour session
     there would let the next customer use the previous customer's account. On the kiosk, log out
     automatically after each order and after a few minutes without activity (gap recorded by the
     owner in step 9, to build in the customer phase).
  2. Their own phone from home (internet). See the open item in `docs/05-roadmap.md`. Phones keep
     the normal session.
- A customer must never reach line monitoring, telemetry or control endpoints. Role guards on both
  backend and frontend.
- Phase 1 builds the monitoring interface (the line pages) for **managers and workers** (owner,
  step 11, as decided with departments in step 9: every worker can open every section for now).
  The worker's own tools (`/worker`) and the customer interface (`/customer`) are protected
  routes with an empty "coming soon" page. The sign-up page for customers is built in phase 1.
- After login (owner, step 11): managers and workers land on `/line`, customers on `/customer`.
  A user with a temporary password lands on the change-password page and cannot leave it until
  the password is changed. A page the role may not open sends the user to their own landing page.
- Logout ends the session on the server too (owner, step 11): see "Sessions on the server" in
  `docs/04-architecture.md`.
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
│   ├── Rinse water container
│   └── Empty container magazine
├── Mixing & Color
│   ├── Mixing      (vessel, scale, mixer and its frame, dye shelf, dye bottles + scales, dye pumps,
│   │                base, water and drain pumps)
│   └── Color       (camera box: camera, flow cell, window, white patch, LED strips; sample pump;
│                    customer camera, not installed)
├── Conveyor
│   ├── Feeder
│   ├── Filling
│   ├── Check + Reject + Cap
│   └── Batch tray             (not installed)
└── Control cabinet  (the panel: PLC, ESP32s, power, buttons, tower light; the switch and the laptop)
```

When a section has no sub-sections, level 3 is skipped and its components open directly.
Components with `subsection: null` (for example conveyor rollers, belts and frame) are shown and
clickable on their section page. The `table` has no section and is scene-only, not clickable.
Components with a `parent` (for example the camera inside the camera box) are drawn relative to the
same world coordinates but grouped under the parent on component lists.

Suggested routes:
```
/line
/line/:sectionId
/line/:sectionId/:subsectionId
/line/:sectionId/:subsectionId/:componentId
/line/:sectionId/part/:componentId   (parts with subsection: null; "part" is a reserved id)
/worker            (placeholder for the worker's own tools)
/customer          (placeholder)
/login
/signup            (customers only)
/change-password   (forced while the password is temporary; also reachable from the user menu)
/users             (managers only, built last in phase 1)
```

## 3D scene rules

- Built from `machine.json` at runtime. No hardcoded parts.
- **As close to the real line as possible, smooth on a phone** (owner, step 17). Parts are drawn
  from the parts list (`docs/ALMAS_parts_list_2026-11-09.md`) at their real or estimated sizes;
  things that repeat share their shapes, and the scene only redraws when something changes.
- Simple primitives only. Clear tanks show their liquid level and color; opaque ones (the dye
  bottles, owner step 17) do not, since nothing shows through them.
- Containers on the belt (owner, step 17, option b): each container is followed along the belt.
  It appears where a station's sensor (feeder, filling, check, end of belt) sees one; while the
  belt runs it slides at the belt's speed (`conveyor.speedMmPerS`: estimated from the speed and
  the times the belt started and stopped, not measured); when the belt stops, a station's sensor
  puts it exactly on the station; it goes when a sensor stops seeing it with the belt standing
  still (pushed to the reject bin, taken from the end). It is the real tub (tapered black body,
  rim, clear flat lid); lifted while its platform is up; its liquid shows from above at the fill
  height, in the live mix colour, the fill taken from the station's scale while it weighs. It
  keeps its fill and lid on its way; the lid is on once the check passes. Which sensors a
  station uses is in `machine.json` (`conveyor.stations[].container`, `conveyor.runningSensor`).
  Frames are drawn continuously only while the belt runs.
- Tubes and cables (owner, step 17): the pump tubes, the RS485 chain and the Ethernet cables are
  drawn as thin tubes along estimated paths (`machine.json` `links`), on the pages where both of
  their ends are shown. They are not clickable.
- Closed boxes (the cabinet, the camera box) are white and closed on the line page; the first
  click opens their page, where they are see-through with their inside parts shown (owner,
  step 17; in step 12 the camera box opened only one page later, on the Color page).
- Orbit camera with limits (no going under the table). Each page frames its own subject.
- Hover highlights an object and shows its name. Click navigates.
- `pending` parts render as a translucent placeholder with a "pending" tag.
- Parts not installed yet (`installed: false`, owner, step 16) are dimmed in their own colours
  (never the offline grey) with a "Not installed" tag; on the pages a "Not installed" label takes
  the place of the state chip, and a part's page says no data is expected from it.
- Black dye is shown active like the other three.

## State colors (must be visible without clicking)

| State | Look | Rank in roll-up |
|---|---|---|
| fault | red outline / glow | 1 (worst) |
| warning | yellow outline / glow | 2 |
| offline | grey, dimmed (no data for 10 s) | 3 |
| ok | normal colors | 4 |
| none | normal colors, no badge (part has no sensors, or is not installed yet) | not counted |

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
  Since step 14 (owner): each analog sensor's own `decimals`, so numbers do not jump; `C` shown as
  `°C`, no unit for counts, raw values and unitless values; the time as HH:MM:SS in the browser's
  time zone; "No data yet" before the first reading; an offline sensor keeps its last value,
  dimmed; the panel is wider on part pages.
- A small live trend chart per sensor (last few minutes).
- Reserved, empty slots for later twin features: Predicted value, Residual, Health index, Remaining
  useful life. Show them as disabled with "coming later" so the layout does not change later.

Trend charts (owner, step 14):
- Analog sensors: a line chart. Digital and enum sensors: a **state timeline**, a horizontal band
  over time, one colour per value, with the value words from the locale files (never numbers).
- Timeline colours are **neutral greys**, never the state colours (green, yellow, red), so a pump
  being off never looks like a fault. Code 0 (off, normal, empty…) is the faintest. Missing data
  (no reading for 10 s, the offline rule) is empty space: the line breaks, the timeline has no band.
- Time runs **left to right in both languages**: the page flips in Arabic, the chart axis does not,
  so the latest value is always on the right.
- One time window for every chart on the page: 5 minutes (default), 15 or 60. The choice is
  remembered in the browser (local storage), across parts and visits, not in the account.
- Each chart has a spoken summary (lowest and highest value, or each value's share of the window),
  and the arrow keys read the value under a crosshair, like the mouse or a finger.

## Simulated data

Phase 1 runs on the simulator (see `docs/04-architecture.md`). Show a clear "SIMULATION" badge in the
header while the data source is the simulator.

The badge (owner, step 14):
- Shown while at least one sensor's latest reading came from the simulator (`source: sim`), with
  how many out of every sensor in `machine.json`: "SIMULATION 12 of 54 sensors" ("12/54" on phones;
  screen readers always get the full count). 54 since step 17 (60 before).
- In the header, between the breadcrumbs and the language switch, on the line pages (where live
  data is shown; customers never reach them). Hidden before the first data and when every latest
  reading is from hardware. It stays when the simulator stops: the values on screen are still the
  simulated ones.
- Violet outline and text on a light violet tint, a colour used nowhere else (`docs/06-brand.md`).
- On a part's page each simulated value also carries a "Simulated" tag (grey, beside the value).

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

## Theme

Dark and light themes from the same tokens (`docs/06-brand.md`). Owner, step 11:
- Before login (login, sign-up): the browser's setting (`prefers-color-scheme`).
- After login: the theme saved with the user's account, like the language. A user who never picked
  one keeps the browser's setting.

## Devices

Desktop, tablet and phone. Responsive layout. On phones the values panel stacks under the 3D view.
Keep the scene light enough for a mid-range phone.
