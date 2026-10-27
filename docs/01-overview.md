# 01 — Overview

## What the line does

A mini production line that mixes a colored liquid to a recipe and fills it into small containers.
It is inspired by tinting paint on demand. The product does not matter; the **process** does.
All tests use water and diluted food dye.

Flow of material:

```
big base tank --(base pump)--> mixing vessel (on a scale)
dye tanks C/M/Y/K (each on a scale) --(stepper peristaltic pumps, by volume)--> mixing vessel
mixing vessel --(mixer)--> mixed
mixing vessel --(sample pump)--> sample cell in camera box --(back)--> mixing vessel
camera measures color -> correct with more dye -> repeat
mixing vessel --(filling pump)--> container on the conveyor (filled by weight)
container -> check weight -> bad: pushed to reject box / good: lid placed and pressed
good container -> batch tray (6 slots)
mixing vessel --(drain pump)--> drain bucket (between colors: rinse = fill water + drain, twice)
```

## Batch logic (high level)

1. Mix a small amount first (base + dyes in recipe ratio).
2. Pump a sample into the sample cell, photograph it, compare to target color.
3. If wrong: add correction dye to the vessel, sample again. Dye can only be added, never removed,
   so approach the target from the light side.
4. If right: complete the batch with the same ratios.
5. Take a final sample to confirm before filling.
6. Fill 6 containers, check, cap, collect in the tray.
7. Same next color: no rinse. New color: drain + rinse twice, camera confirms clear water.

## The research idea (why the twin matters)

The controller hides faults from the customer (it compensates). The digital twin detects them from
the extra effort the controller spends. Example: a worn dye pump and a weaker dye both cause more
correction doses; the weighed mixing vessel tells them apart (did the commanded dye mass arrive or
not). Multiple independent scales let the system tell which scale drifted.

Prediction, fault detection, health index and remaining-useful-life are **later phases**. The web app
must leave room for them (see `docs/03-ui-spec.md`).

## Controllers (physical side, for context)

- An industrial PLC will run sequencing and safety (model not chosen yet; supervisor is sourcing it).
- ESP32 handles load cells (HX711) and fast loops; values go to the PLC over comms.
- Raspberry Pi 5 handles the camera and is the data gateway.
- The web app receives data via MQTT from the Pi / ESP32. Until hardware exists, the simulator
  publishes the same messages.
- Time: the ESP32 has no battery-backed clock and the lab has no internet, so device timestamps
  can be wrong. Later, the Raspberry Pi will serve time to the ESP32 over NTP on the lab network.
  Until then the backend also records when it received each reading (`docs/04-architecture.md`).

## Team context

3 students, full time. Main goal is learning, at a professional level. The line may later grow into a
full automated factory, and the twin + monitoring box may become a startup product. Design for
extension: a new machine should only need a new `machine.json`.
