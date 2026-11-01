# MixLine

Graduation project, Damascus University, Control & Automation Engineering.
A small automated liquid mixing-and-filling line, and a web app that shows it as a live 3D digital twin.

## Folders

| Folder | What is in it |
|---|---|
| [`web-app/`](web-app/) | The digital twin web app: 3D view, backend, database, simulator, and the project specs in `web-app/docs/`. To install and run it, see [`web-app/README.md`](web-app/README.md) |
| [`plc/`](plc/) | PLC programs and project files |
| [`esp32/`](esp32/) | ESP32 firmware |

Each folder stands alone. Add a new folder at this level if a new area of work starts.

## Adding your work

Work on your own branch, and only inside your folder. Mohammed reviews it and merges it into `main`.

**With Git:**

```
git clone https://github.com/alimzn42-del/final-project.git
cd final-project
git switch -c plc-first-program
```

Put your files in `plc/` or `esp32/`, then:

```
git add plc esp32
git commit -m "feat(plc): first program"
git push -u origin plc-first-program
```

Then open a pull request on GitHub.

**In the browser:** open the folder on GitHub, choose **Add file > Upload files**, and at the bottom pick
**Create a new branch**. Files must be under 25 MB this way. With Git, GitHub refuses any file over 100 MB.

## Rules

- **No passwords in the repo.** No Wi-Fi or MQTT passwords, in any file. GitHub keeps every old version,
  so deleting one later does not remove it.
- **Do not change files in someone else's folder.** If you need a change there, ask them.

## How the parts connect

Data from the line reaches the web app over MQTT, so these two files are the agreement between the hardware
and the web app. Talk to Mohammed before changing either of them.

- [`web-app/config/machine.json`](web-app/config/machine.json): every component and sensor on the line.
- [`web-app/docs/04-architecture.md`](web-app/docs/04-architecture.md), section "MQTT": the exact topics, message format and publishing rules.

To understand the line, start with [`web-app/docs/01-overview.md`](web-app/docs/01-overview.md).
