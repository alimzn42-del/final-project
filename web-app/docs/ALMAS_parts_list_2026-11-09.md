# ALMAS — Full Parts List (for building the 3D scene)

> Updated: 9 Nov 2026. Reflects every decision up to today (PLC + 3 active ESP32 stations + Pi).
> Grouped by zone of the line, so each group can be modelled as one area of the scene.
> **(deferred)** = planned but not built now; model it greyed out or leave it out.

---

## 1. Totals at a glance

| Category | Total |
|---|---|
| Tanks / bottles / vessels | 9 (1 base tank, 1 mixing vessel, 4 dye bottles, 1 water container, 1 drain bucket, 1 flow cell) |
| Pumps | 9 (4 peristaltic stepper + 5 DC) |
| Load cells (scales) | 7 (6 × 1 kg, 1 × 5 kg) |
| Servos | 4 (3 × MG996R, 1 × MG90S) |
| Other motors / actuators | 4 (mixer, conveyor, lid press, infeed solenoid) + 1 tray stepper (deferred) |
| Proximity sensors | 5 (E3F-DS30C4) |
| Other sensors | 3 (ultrasonic level, press end switch, mixer speed sensor if fitted) |
| Controllers | 1 PLC, 3 ESP32 (+1 deferred), 1 Raspberry Pi 5 |
| Cameras | 2 |
| Containers per order | 6 (500 g capacity, filled with 300 g) |

---

## 2. Zone A — Tanks and mixing (Station 2 + Station 1)

| Part | Qty | Details | Controlled by |
|---|---|---|---|
| Base tank (big) | 1 | Holds the base liquid; no scale | — |
| Ultrasonic level sensor HC-SR04 | 1 | On top of the base tank, looking down | Station 2 |
| Mixing vessel | 1 | Clear plastic, 23 cm tall × 16 cm diameter, inside a closed box | — |
| Vessel round base plate | 1 | Printed, sits on the 5 kg load cell | — |
| Load cell 5 kg + HX711 | 1 | Under the mixing vessel | Station 2 |
| Mixer | 1 | Overhead motor (5 V; or the motor with a speed sensor), stainless shaft, printed 3-blade propeller, hung from the frame | Station 2 |
| Dye bottles (opaque) | 4 | C, M, Y, black; placed high | — |
| Load cell 1 kg + HX711 | 4 | One under each dye bottle | Station 1 |
| Peristaltic pump (NEMA 17 + printed head + TMC2209) | 4 | One per dye, bottle → vessel | Station 1 |
| Base pump (DC, R385 12 V) | 1 | Base tank → vessel | Station 2 |
| Water container (rinse) | 1 | External, for rinsing | — |
| Water pump (DC, R385 12 V) | 1 | Water container → vessel | Station 2 |
| Drain pump (DC, R385 12 V) | 1 | Vessel → drain bucket | Station 2 |
| Drain bucket | 1 | On the floor under the line | — |
| Sample pump (DC, reversible) | 1 | Vessel ↔ flow cell (send and return) | Station 2 |
| Flow cell | 1 | Small, beside the vessel; printed white body + glass window | — |
| Tubes / dip tubes | ~9 | One per pump; suction method into the vessel still *open* (wall hole vs rigid dip tube) | — |

---

## 3. Zone B — Camera and lighting (Pi)

| Part | Qty | Details |
|---|---|---|
| Closed lighting box | 1 | Around the vessel + flow cell, for stable light |
| White LED strip 12 V | 1 | Inside the box |
| Camera Module 3 (normal) | 1 | Looks at the flow cell only |
| White reference patch | 1 | In the camera view, for lighting compensation |
| Camera Module 2 (customer camera) | 1 | Customer colour station (planned feature) |
| Camera mount (printed) | 2 | — |

---

## 4. Zone C — Conveyor and infeed (PLC)

| Part | Qty | Details |
|---|---|---|
| Conveyor | 1 | Twin narrow belts on one motor, with a gap in the middle for the lift platforms |
| Conveyor motor JGB37-520 12 V, 60–100 RPM | 1 | Run/stop by the PLC through a relay |
| Belts | 2 | Narrow, parallel |
| Rollers + 8 mm shafts + 608ZZ bearings | 1 set | — |
| Container magazine | 1 | Vertical PVC tube 110 mm, holding a stack of empty containers |
| Infeed gate (push-pull solenoid 12 V) | 1 | At the bottom of the magazine; releases one container |
| Proximity sensors E3F-DS30C4 | 5 | Magazine empty, infeed, arrival at filling, arrival at check, end of conveyor |
| Containers | 6 | 500 g capacity, filled with 300 g, press-on lids |

---

## 5. Zone D — Filling position (Station 2)

| Part | Qty | Details |
|---|---|---|
| Lift-and-weigh platform | 1 | Rises between the two belts and lifts the container off the conveyor |
| Lift servo MG996R | 1 | Drives the platform (rack and pinion) |
| Load cell 1 kg + HX711 | 1 | On the platform (container scale) |
| Fill pump (DC, R385 12 V) | 1 | Vessel → container (loss-in-weight) |
| Fill nozzle | 1 | Above the platform |

---

## 6. Zone E — Check / reject / cap position (Station 3)

| Part | Qty | Details |
|---|---|---|
| Lift-and-weigh platform | 1 | Same design as the filling platform |
| Lift servo MG996R | 1 | — |
| Load cell 1 kg + HX711 | 1 | On the platform (check scale) |
| Reject pusher servo MG996R | 1 | Pushes bad containers off the belt |
| Reject bin | 1 | On the front (audience) side |
| Lid magazine + drop gate | 1 | Holds the lids |
| Lid-drop servo MG90S | 1 | Drops one lid while the container is still lifted |
| Lid press (car central-lock actuator 12 V) | 1 | Presses the lid after the platform lowers |
| Press end switch KW12 | 1 | Confirms the press reached the end |
| Press head (printed) | 1 | — |

---

## 7. Zone F — Outfeed (deferred)

| Part | Qty | Details |
|---|---|---|
| 6-slot tray | 1 | Slides sideways on a rail (deferred) |
| Tray stepper NEMA 17 + TMC2209 | 1 | (deferred) |
| MGN12H rail + GT2 belt + pulley + idler | 1 set | (deferred) |
| Home switch KW12 | 1 | (deferred) |
| Station 4 ESP32 | 1 | (deferred) |

Until the tray is built, containers stop at the end of the conveyor.

---

## 8. Zone G — Control panel (PLC)

| Part | Qty | Details |
|---|---|---|
| PLC Inovance Easy320-0808TN | 1 | 8 DI, 8 DO (transistor), 1 RS485, 2 Ethernet |
| DI card GE20-4DI | 1 | +4 inputs (12 total) |
| Start button (green NO) | 1 | LA38-11 22 mm |
| Stop button (red NC) | 1 | LA38-11 22 mm |
| Reset button (yellow NO) | 1 | LA38-11 22 mm |
| Emergency stop (mushroom, latching, 2NC) | 1 | 22 mm |
| Tower light + buzzer LTA-205J 24 V | 1 | Green, yellow, red |
| Relay board 4-ch 24 V, low-level trigger | 1 | Conveyor + infeed solenoid |
| Contactor CJX2-0910Z (24 VDC coil) | 1 | Cuts the 12 V motor line on E-stop |
| DIN rail + terminals + fuse holders | 1 set | — |

---

## 9. Zone H — Stations (ESP32 boxes)

| Part | Qty | Details |
|---|---|---|
| ESP32 DevKit V1 | 3 (+1 deferred) | Stations 1, 2, 3 |
| MAX3485 RS485 module | 3 (+1 deferred) | One per ESP32 |
| ESP32 terminal expansion board | 3 (+1 deferred) | — |
| ESP32 DIN enclosure (printed) | 3 (+1 deferred) | — |
| TMC2209 driver + 100 µF capacitor | 4 | Station 1 dye pumps |
| D4184 MOSFET module + 1N5822 diode | 4 | Station 2: base, water, fill, drain pumps |
| Sample pump reversing driver | 1 | Station 2 (H-bridge or 2-channel relay — *to choose*) |
| Mixer switching (MOSFET or relay) | 1 | Station 2 |
| 2-channel relay 5 V (polarity swap) | 1 | Station 3 lid press |
| HX711 | 7 | 4 on station 1, 2 on station 2, 1 on station 3 |

---

## 10. Zone I — Computers and network

| Part | Qty | Details |
|---|---|---|
| Raspberry Pi 5 4 GB | 1 | Camera station + twin (currently dead; repair or replace) |
| Pi 5 27 W PSU + RTC battery | 1 + 1 | — |
| Laptop | 1 | Web app (3D twin screen) |
| Ethernet switch TP-Link TL-SF1005D | 1 | PLC + Pi + laptop |
| Cat6 patch cables | 3 | — |
| RS485 twisted pair + 120 Ω resistors | 1 run + 2 | PLC → station 1 → station 2 → station 3 |

---

## 11. Zone J — Power

| Part | Qty | Details |
|---|---|---|
| Mean Well LRS-150-12 | 1 | 12 V motor line (after the contactor) |
| Mean Well LRS-75-24 | 1 | 24 V: PLC, sensors, ESP32 |
| LM2596 buck (24 → 5 V) | 3 (+1 deferred) | One per ESP32; stays alive during E-stop |
| Buck 12 → 5 V for the mixer | 1 | After the contactor |
| XL4015 5 A buck (12 → 5 V) for servos | 2 | Station 2 (lift) and station 3 (lift, reject, lid) |

---

## 12. Connections to draw in the scene

| From | To | Link |
|---|---|---|
| PLC | Stations 1, 2, 3 | RS485 (one daisy-chained cable) |
| PLC | Switch → Pi, laptop | Ethernet |
| Dye bottles (×4) | Mixing vessel | Peristaltic pump tubes |
| Base tank | Mixing vessel | Base pump |
| Water container | Mixing vessel | Water pump |
| Mixing vessel | Flow cell | Sample pump (both ways) |
| Mixing vessel | Container at filling | Fill pump |
| Mixing vessel | Drain bucket | Drain pump |
| Magazine → filling → check → end | — | Conveyor path |
