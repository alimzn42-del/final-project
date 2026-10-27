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
7. Last step of phase 1: user management page for managers (create manager and worker accounts).

Done when: `docker compose up --build` starts everything, a manager can log in, browse every level,
and see values moving.

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
- Digital twin: predicted values, residuals, fault detection, health index, remaining useful life,
  what-if scenarios.
- Alarms UI and acknowledgement from the web.
- Real hardware: Raspberry Pi and ESP32 publishing instead of the simulator.
- Grafana dashboards (optional, reads the same database).

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
| PLC alarm list, message-format rules, and how alarms reach the web app | warning / fault states, alarm display, the `alarms` table, limits in `machine.json` |
| How customers reach the app from the internet (hosting, tunnel, or cloud server for ordering only) | customer ordering from phones |
| Password reset and email verification (need an email provider) | customer self-signup hardening |

When one of these is decided, update `docs/02-line-spec.md` and `config/machine.json` together.
