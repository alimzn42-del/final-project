# 01 — Overview

## What the line does

A mini production line that mixes a colored liquid to a recipe and fills it into small containers.
It is inspired by tinting paint on demand. The product does not matter; the **process** does.
All tests use water and diluted food dye.

Flow of material:

```
big base tank --(base pump)--> mixing vessel (on a scale, in a closed lighting box)
dye bottles C/M/Y/K (each on a scale) --(stepper peristaltic pumps, by volume)--> mixing vessel
mixing vessel --(mixer, hung from a frame)--> mixed
mixing vessel --(sample pump)--> flow cell beside it --(back)--> mixing vessel
camera measures color against a white patch -> correct with more dye -> repeat
mixing vessel --(filling pump)--> container on the conveyor (the vessel scale decides when to stop)
container -> check weight -> bad: pushed to the reject bin / good: lid dropped, then pressed
good container -> end of the belt, taken away (later: a 6-slot tray, not built yet)
rinse water container --(water pump)--> mixing vessel --(drain pump)--> drain bucket
                                         (between colors: rinse = fill water + drain, twice)
```

## Batch logic (high level)

1. Mix a small amount first (base + dyes in recipe ratio).
2. Pump a sample into the sample cell, photograph it, compare to target color.
3. If wrong: add correction dye to the vessel, sample again. Dye can only be added, never removed,
   so approach the target from the light side.
4. If right: complete the batch with the same ratios.
5. Take a final sample to confirm before filling.
6. Fill the containers the order asks for, check, cap, and take them from the end of the belt.
   Until orders exist, the simulator picks 4 to 10 per batch (owner, step 17; both estimates).
7. Same next color: no rinse. New color: drain + rinse twice, camera confirms clear water.

## The research idea (why the twin matters)

The controller hides faults from the customer (it compensates). The digital twin detects them from
the extra effort the controller spends. Example: a worn dye pump and a weaker dye both cause more
correction doses; the weighed mixing vessel tells them apart (did the commanded dye mass arrive or
not). Multiple independent scales let the system tell which scale drifted.

Prediction, fault detection, health index and remaining-useful-life are **later phases**. The web app
must leave room for them (see `docs/03-ui-spec.md`).

## Controllers (physical side, for context)

Hardware reference (owner, step 17): the parts list `docs/ALMAS_parts_list_2026-11-09.md`. It is
newer than these docs: where it says something it wins, where it is silent the docs stay.

- An industrial PLC runs sequencing and safety: an Inovance Easy320-0808TN with a 4-input card
  (parts list 2026-11-09).
- **Design decision: the PLC owns all limits, alarms, interlocks and safety decisions.** The web
  app only reads and displays what the PLC reports; it never decides that a value is a warning or
  a fault on its own. Alarms per component are defined later, when the PLC program is designed
  (open item in `docs/05-roadmap.md`).
- Three ESP32 stations (a fourth for the tray later), each next to its zone, handle the load
  cells (HX711), the pump drivers and the servos. They talk to the PLC over one RS485 cable,
  daisy-chained PLC -> station 1 -> 2 -> 3 (parts list 2026-11-09).
- The PLC is on Ethernet, with the Raspberry Pi 5 and the laptop, through a small switch.
- The Raspberry Pi 5 is the camera station (it reads the flow cell) and later runs the twin.
- Data path (owner, step 17): a **gateway program** reads the PLC over Ethernet and publishes to
  MQTT with exactly the topics and messages the simulator uses now; it runs on the laptop for
  now and on the Pi later. It is built in the hardware phase (`docs/05-roadmap.md`); the web app
  and the simulator do not change because of it. Until then the simulator publishes the same
  messages.
- The laptop runs the web app; its screen shows the 3D twin (the panel has no screen of its own).
- Time: the ESP32s have no battery-backed clock and the lab has no internet, so device
  timestamps can be wrong. The plan was a battery on the Pi's real-time clock and the Pi serving
  time to the ESP32s over NTP; but the ESP32s are on RS485 now, not on the network. Owner, step
  17: decided with the gateway (doc 05). The backend also records when it received each reading
  (`docs/04-architecture.md`).

## Team context

3 students, full time. Main goal is learning, at a professional level. The line may later grow into a
full automated factory, and the twin + monitoring box may become a startup product. Design for
extension: a new machine should only need a new `machine.json`.
