# MixLine web app

The live 3D digital twin of the mixing-and-filling line. It runs without any hardware: a simulator
publishes fake sensor data on the real MQTT topics.

## What you need

| To do this      | Install                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Run the app     | [Git](https://git-scm.com/downloads) and [Docker Desktop](https://www.docker.com/products/docker-desktop/), with about 4 GB of memory free |
| Change the code | Also [Node.js](https://nodejs.org/) 24 (24.15 or newer) and pnpm 10: `npm install -g pnpm@10`                                              |

## Run the app

**1. Get the code**

```
git clone https://github.com/alimzn42-del/final-project.git
cd final-project/web-app
```

**2. Create your settings**

```
cp .env.example .env
```

Use PowerShell or Git Bash for this command on Windows. Then open `.env` and replace every `change-me`,
using letters and numbers only. Git ignores `.env`, so your passwords stay on your computer.

| Setting             | Value                                                 |
| ------------------- | ----------------------------------------------------- |
| `POSTGRES_PASSWORD` | Any password                                          |
| `MQTT_PASSWORD`     | Any password                                          |
| `JWT_SECRET`        | At least 32 characters, or the backend will not start |
| `MANAGER_PASSWORD`  | At least 8 characters. This is your first login       |

**3. Build and start**

Docker Desktop must be running. The first build downloads a lot, so it needs internet and takes a
while. Building one image at a time keeps memory use low.

```
docker compose build migrate
docker compose build backend
docker compose build simulator
docker compose build frontend
docker compose up -d --wait
```

**4. Open it**

Go to http://localhost:8080 and log in with `MANAGER_EMAIL` and `MANAGER_PASSWORD` from your `.env`.
The app asks you to choose a new password the first time.

**Stopping and updating**

- Stop: `docker compose down` (your data is kept).
- Start again: `docker compose up -d --wait`.
- After `git pull`: repeat step 3, because the images hold a copy of the code.

## Change the code

Stop the full app first (`docker compose down`), because the steps below use the same ports. Then,
from `web-app/`:

```
pnpm i
docker compose up -d --wait db mqtt
pnpm db:migrate
pnpm dev
```

`pnpm dev` starts the web app at http://localhost:5173, plus the backend and the simulator. They reload
when you save a file.

Before each commit, all three of these must pass. They do not need Docker.

```
pnpm lint
pnpm typecheck
pnpm test
```

Work on your own branch, as the [main README](../README.md) describes. The project rules and the full list
of commands are in [`CLAUDE.md`](CLAUDE.md).

### Where things are

| Path                  | What it is                                                             |
| --------------------- | ---------------------------------------------------------------------- |
| `apps/frontend`       | The React app and the 3D scene                                         |
| `apps/backend`        | The NestJS API, login, and telemetry intake                            |
| `apps/simulator`      | The fake sensor data                                                   |
| `packages/shared`     | Types and rules shared by all the apps                                 |
| `config/machine.json` | Every component and sensor on the line. The scene is generated from it |
| `config/locales`      | All text in English and Arabic                                         |
| `docs`                | The specs. Start with [`docs/01-overview.md`](docs/01-overview.md)     |

## Connecting real hardware

Hardware talks to the app by publishing MQTT messages to the same broker the simulator uses.

- **Broker:** port `1883`, with `MQTT_USERNAME` and `MQTT_PASSWORD` from `.env`.
- **For now it only accepts connections from the same computer.** `docker-compose.yml` binds the port to
  `127.0.0.1`, so an ESP32 on the network cannot connect yet. Talk to Mohammed before changing that.
- **Stop the simulator** while testing, so it does not publish the same sensors:
  `docker compose stop simulator`.

A message looks like this, on the topic `lab/mixline/mixer/sensors/mass`:

```json
{ "ts": "2026-10-27T12:00:00.000Z", "value": 1834.2, "unit": "g", "source": "hw" }
```

Sensor names and units come from [`config/machine.json`](config/machine.json). The full rules are in the
"MQTT" section of [`docs/04-architecture.md`](docs/04-architecture.md).

## If something goes wrong

| Problem                                       | What to do                                                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| The backend does not start                    | Run `docker compose logs backend`. It lists every wrong setting                                                                         |
| A port is already in use                      | Change `WEB_PORT`, `PORT`, `POSTGRES_PORT` or `MQTT_PORT` in `.env`                                                                     |
| A build stops halfway                         | Usually the internet or memory. Run the same build command again                                                                        |
| `ERR_PNPM_UNSUPPORTED_ENGINE` on `pnpm i`     | Your Node.js is too old. Install 24.15 or newer                                                                                         |
| Database login fails after you changed `.env` | The database keeps the password from its first start. Put the old one back, or run `docker compose down -v`, which **deletes all data** |
