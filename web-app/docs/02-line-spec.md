# 02 — Line Specification

Every part of the physical line, where it sits, what it is made of, and its sensors.
`config/machine.json` encodes the same data for code. If the two disagree, ask the owner.

**Hardware reference (owner, step 17):** the parts list `docs/ALMAS_parts_list_2026-11-09.md`.
It is newer than this document: where it says something it wins; where it is silent, this
document stays. Its "6 containers" and "300 g" are ignored: the order decides the batch, and the
fill is an estimated simulator setting. Any size it does not give is `estimated`.

## Status labels

| Status | Meaning |
|---|---|
| `confirmed` | Decided and measured. Use as is. |
| `estimated` | Decided in principle, number is a best guess. Keep it configurable. |
| `pending` | Not decided yet. Show a labeled placeholder, do not invent details. |

Installed (owner, step 16): every part in `machine.json` also has `installed: true | false`
(default true), **separate from the status above**. The status says whether the design is decided;
`installed` says whether the part is built into the line yet. A part with `installed: false` sends
no data: it is never offline and raises no warning, the scene and pages show it dimmed with a "not
installed" label, and the simulator skips recipes that need its dye pump. Not installed since
step 17: the batch tray with its rail, belt, stepper and home switch, and the customer camera
with its mount.

## Coordinate system (for the scene)

- Units: millimeters, grams.
- Origin: front-left corner of the table top.
- `x` to the right along the conveyor, `y` up, `z` toward the back (wall side).
- Each component has an `anchor`:
  - `bottom` (default): `position` is the center of the footprint at the bottom face.
  - `center`: `position` is the geometric center (used for rotated parts: rollers, door buttons,
    LED strips).
- Rotation is applied about the anchor point, in degrees, order X then Y then Z.
- Cylinders have their axis along `y` before rotation.
- `hollow: true` boxes are drawn as walls of `wallThickness` (camera box, cabinet). Child parts
  sit inside the inner volume.
- "Front" = committee / viewer side (low `z`). "Back" = wall side (high `z`).

## Liquids

Defined in `machine.json` → `liquids`:
- `base`: clear water, light blue tint, low opacity.
- `mix`: live color from the camera reading (L*a*b* converted to RGB); `hex` is the fallback. The
  flow cell's window and the containers on the belt show it too (owner, step 17).
- The dye bottles are opaque (owner, step 17), so no dye level is drawn.

## Global layout (top view)

```
z (back)
 800 +--------------------------------------------------------------------+
     | [BIG TANK]  [PEDESTAL+VESSEL]  [CAMERA BOX]   [CABINET]              |  drain bucket on the
     |             (dye shelf above it,                                    |  floor, back-right
     |              the mixer frame over the vessel)                       |
 450 |                                       [SW]    [LAPTOP]       tray  |
 250 |==[FEEDER]=====[FILLING]=====[CHECK+CAP]=========end|          rail  |
     |  [customer camera]          [REJECT BIN]                      (z)   |
   0 +--------------------------------------------------------------------+
     0                                                                 1800  x
```

- Back row, left to right: big base tank (rinse water container on the floor under it), the
  mixing vessel on a pedestal with the dye shelf above it and the mixer frame over it, the camera
  box (touching the cabinet's left wall), the control cabinet (right-back corner). Owner, step 17:
  the vessel and the camera box stand apart, as in the earlier design.
- Front row: conveyor, left to right: feeder, filling, check+reject+cap, the end of the belt;
  the batch tray (not installed) after it.
- Filling station sits directly in front of the mixing vessel (short filling hose).
- Reject bin sits in front of the check station, on the viewer side.
- Drain bucket sits on the floor, back-right.
- The laptop stands in front of the cabinet, the Ethernet switch beside it.
- All wood (MDF), all wood near liquids is varnished / waterproofed.

| Item | Value | Status |
|---|---|---|
| Table | 1800 x 800 mm, top at y=0, floor at y=-750 | estimated |
| Conveyor centerline | z = 250 | estimated |
| Belt top surface | y = 100 | estimated |

## Containers (product)

Owner, step 17: the container is chosen. Each field in `machine.json` → `container` sits under
`confirmed` or `estimated`.

| Item | Value | Status |
|---|---|---|
| Type | Tapered round tub (nests), black opaque PP body, clear snap-on flat lid | confirmed |
| Size | bottom outer Ø79, top outer Ø113 at the lid, height 77 (taken as the closed tub, lid included) | confirmed |
| Capacity | about 500 ml (the inside up to the lid works out at 496 ml) | estimated |
| Empty body / lid | 16 g / 6 g | estimated |
| Wall, rim overhang, rim height, lid thickness | 0.6, 3, 3, 2 mm | estimated |
| Nesting step | 10 mm per tub in the stack | estimated |
| Fill | 350 ml = 350 g per container, a simulator setting (`config/simulator.json` `order`), to be confirmed by a spill test; it stands about 57 mm high, 99 mm wide | estimated |
| Batch | No fixed size: the customer's order decides. Until orders exist, the simulator picks 4 to 10 per batch (`order`, both limits estimated) | estimated |

Everything sized from the container (the magazine tube, the lid magazine, the weigh platforms,
the nozzle height, the tray slots) is `estimated` and scaled from this tub. The belts stay as
confirmed: the 79 mm base sits on their 90 mm span.

In the scene (owner, step 17, option b) each container is followed along the belt: it appears
where a station's sensor sees one, slides at the belt's speed while the belt runs (estimated,
not measured), is put on the station exactly when its sensor sees it, and carries its fill and
lid with it.

---

## Section: Supply

### Big base tank
| Item | Value | Status |
|---|---|---|
| Shape | Clear plastic cylinder with screw lid (same style as mixing vessel, bigger) | confirmed |
| Size | Ø250 x H310 (about 15 L); fallback Ø220 x H270 (about 10 L) | estimated |
| Position | x=180, z=620, on a flat 18 mm MDF board 260 x 260 (moved left to clear the shelf post) | estimated |
| Outlet | Side wall, near the bottom, facing the mixing vessel | confirmed |
| Scale | None | confirmed |
| Level sensor | HC-SR04 ultrasonic in the lid, looking down (printed holder) | confirmed |
| Float | None (owner, step 17: every float is removed on purpose) | confirmed |

### Rinse water container (parts list 2026-11-09)
| Item | Value | Status |
|---|---|---|
| Purpose | External container of rinse water | confirmed |
| Position | On the floor under the big tank | estimated |
| Size | Ø200 x H250 | estimated |
| Sensors | None (no scale, no level sensor), so the scene shows no level | confirmed |

### Empty container magazine
Belongs to the Supply section in the UI. It is the vertical tube of nested empty containers that feeds
the conveyor. Its release (the infeed gate) belongs to the Conveyor / Feeder station.

| Item | Value | Status |
|---|---|---|
| Tube | Vertical PVC tube 110 mm (owner, step 17: an assumption, not a decision; resized when chosen) | estimated |
| Fit | A 110 mm PVC pipe is about 103 mm inside, less than the 113 mm tub top: it cannot hold these tubs as they are (open item, doc 05) | open |
| Magazine empty sensor | E3F-DS30C4 proximity sensor near the bottom: 1 when no container is left | confirmed |

---

## Section: Mixing & Color

### Pedestal
| Item | Value | Status |
|---|---|---|
| Purpose | Raise the vessel so its bottom is 50 mm above the container top | confirmed |
| Size | 300 x 300 footprint, height 178.3 (= 227 vessel bottom − 48.7 scale stack) | estimated |
| Position | x=550, z=600 | estimated |

The container top is at 177 (belt 100 + tub 77), so the vessel bottom is at 227.

### Mixing vessel scale (one scale)
Stack, bottom to top:
1. Bottom plate: MDF 18 mm, Ø240.
2. Spacer 1 (printed, 12.7 x 20 x 5 mm, 100% infill) under the **left** end of the load cell.
3. Load cell: bar type 5 kg, 80 x 12.7 x 12.7 mm, M4 holes.
4. Spacer 2 on top of the **right** end of the load cell.
5. Top plate: a **printed round plate** (parts list 2026-11-09; owner, step 17), Ø200, 8 mm
   thick (estimated). The vessel stands on it.
6. Overload-stop screw under the top plate edge, about 1 mm gap.
7. HX711 board in a small printed box next to the scale.

Status: confirmed (the printed plate's thickness and the spacers' size estimated). The dye scales
keep the MDF plates and spacers (owner, step 17).

With 10 containers the vessel holds 10 x 350 + 200 = 3.7 kg of liquid; with the vessel, its lid
and the plate (estimated) the 5 kg cell carries about 4.6 kg. The mixer no longer adds to it.

### Mixing vessel
| Item | Value | Status |
|---|---|---|
| Shape | Clear plastic cylinder with screw lid | confirmed |
| Size | Ø160 x H230 (about 4.6 L) | confirmed |
| Mounting | Placed on the printed base plate, not fixed; standing alone (owner, step 17: not in a box) | confirmed |
| Anti-rotation | Pegs or rubber pad so mixer torque cannot turn it | pending |
| Working batch | (containers x 350 g) + about 0.2 L heel: 1.6 to 3.7 L | estimated |
| Lid | Used as a manifold: holes for all tubes and the mixer shaft | confirmed |
| Overflow float | None (owner, step 17) | confirmed |

Tubes entering through the lid: 4 dye lines, base line, water line, sample line, the flow cell's
vent, drain suction, filling suction. All soft silicone with a slack loop, so they do not pull the
weighed vessel.

### Mixer
| Item | Value | Status |
|---|---|---|
| Concept | Overhead motor (5 V, or the motor with a speed sensor), stainless shaft, printed 3-blade propeller | confirmed |
| Mounting | Hangs from a frame over the vessel (owner, step 17), so the vessel scale does not carry it | confirmed |
| Mixer frame | 20 x 20 aluminium beam on two posts beside the pedestal | estimated |
| Detailed design | Being designed by a teammate | pending |
| Blade height | about 20 mm above the vessel bottom | estimated |
| Rule | Stop mixing before weighing and before taking a sample | confirmed |
| Sensor | Speed (rpm), if the motor with the speed sensor is fitted | pending |

### Dye shelf
| Item | Value | Status |
|---|---|---|
| Purpose | Holds 4 dye bottles above the mixing vessel | confirmed |
| Material | MDF 18 mm | confirmed |
| Size | 480 x 200, on two posts at the back corners | estimated |
| Dye positions | x = 377.5, 492.5, 607.5, 722.5 (115 mm pitch), z = 650 | estimated |
| Height | Bottom of shelf about 100 mm above the mixer motor: 680 (the motor hangs from its frame) | estimated |
| Pumps | 4 dye pumps mounted under the front edge of the shelf | confirmed |

### Dye bottles (x4: cyan, magenta, yellow, black)
| Item | Value | Status |
|---|---|---|
| Shape | Opaque bottles (parts list 2026-11-09; owner, step 17), drawn in their dye's colour | confirmed |
| Size | Ø90 x H110 (about 700 ml), sized to fit the 1 kg cell | estimated |
| Order on shelf | left to right: cyan, magenta, yellow, black | estimated |
| Outlet | Side wall near the bottom, facing front toward the pumps | confirmed |
| Scale | Each bottle on its own 1 kg scale (same stack as the vessel, MDF Ø100 plates, 15 mm gap between neighbours) | confirmed |
| Dye | Food dye diluted 1:9 in distilled water | confirmed |
| Black | Shown and simulated as active from day one; hardware wired later | confirmed |

Possible colors: CMY mixes give green (C+Y), red/orange (M+Y), blue/violet (C+M), browns (all three).
Black gives true black, greys and cleaner dark shades. White is not possible (base is clear).

### Dye pumps (x4)
| Item | Value | Status |
|---|---|---|
| Type | Peristaltic, 3D-printed head on NEMA17 stepper | confirmed |
| Driver | TMC2209 (with a 100 µF capacitor), with the station 1 ESP32 | confirmed |
| Bearings | 695ZZ (5 x 13 x 4 mm), per the chosen printed design | confirmed |
| Dosing | By volume: steps x calibrated grams-per-step | confirmed |
| Signals | steps, speed, driver load, running | confirmed |

### Base pump
R385 12 V diaphragm pump, big tank to vessel, stops on vessel weight. Signals: running, current.
Status: confirmed.

### Water pump (parts list 2026-11-09)
R385 12 V diaphragm pump, rinse water container to vessel, for the rinses. Signals: running,
current. Status: confirmed (its size estimated, as the base pump).

### Drain pump
Third R385, vessel to drain bucket, runs until the vessel reads empty weight (with timeout).
Status: confirmed. The suction into the vessel is still open (a hole in the wall or a rigid dip
tube; parts list).

### Camera box (owner, step 17)
Closed box, matte black (owner, step 17: it stays black), next to the vessel, touching the
control cabinet's left wall. The
parts list puts one lighting box around the vessel and the flow cell; the owner chose, after
seeing it in the scene, to keep the vessel alone and the camera box apart, as in the earlier
design. Inside: the camera, the flow cell, its white patch and the LED strips.

| Item | Value | Status |
|---|---|---|
| Box | outer 250 x 150 x 140, walls 6 mm MDF, inside about 238 x 138 x 128 | estimated |
| Camera | Raspberry Pi Camera Module 3 on a printed mount, straight on at 90 degrees to the flow cell window, lens 120 mm from it; it looks at the flow cell only | confirmed |
| Flow cell | Beside the vessel: printed white body, glass window toward the camera; inside 40 x 40 x 10 mm (16 ml), 10 mm of liquid between the glass and the white back | estimated |
| Light path | The light crosses the liquid to the white back and back again: 20 mm | estimated |
| Ports | One port at the bottom, both ways (fill and empty); the vent tube back to the vessel lid stays | confirmed |
| White reference patch | Beside the window, outside the glass, the same white plastic as the cell; every reading is relative to it | confirmed |
| Light | White 12 V LED strip, at 45 degrees on both sides of the window, so the glass glare does not reach the camera | confirmed |
| Camera cable | 200 mm for now (Pi 5 22-pin to camera), longer later | confirmed |

The camera box, the acrylic sample cell, its holder, the diffuser and the LED panel of earlier
steps are gone (parts list 2026-11-09).

### Sample pump
DC pump, reversible (the driver, an H-bridge or a 2-channel relay, is still to choose). Forward
fills the flow cell from the vessel through its bottom port; reverse empties it back into the
vessel. Same cycle with rinse water cleans the cell. Status: confirmed.

### Customer camera (parts list 2026-11-09)
Raspberry Pi Camera Module 2 on a printed mount, for the customer colour station, a planned
feature. Not installed; at the front of the table, position estimated (owner, step 17).

### Drain bucket
On the floor, back-right, 10 L or more. No float (owner, step 17). Status: confirmed.

---

## Section: Conveyor

### Belt
| Item | Value | Status |
|---|---|---|
| Type | Two narrow parallel belts on the same rollers, one motor | confirmed |
| Support | A rigid rail under each belt, open gap between rails | confirmed |
| Length | x = 100 to 1350 | estimated |
| Belt width / gap | 25 mm each, 40 mm gap | estimated |
| Motor | JGB37-520 12 V gear motor, 60–100 rpm | confirmed |
| Speed control | None: the PLC runs or stops it through a relay; no rotation sensor (parts list; owner, step 17) | confirmed |
| Arrival sensor | One per station, and one at the end of the belt (E3F-DS30C4) | confirmed |
| Speed | One speed, about 100 mm/s (60–100 rpm on the 30 mm roller); `machine.json` conveyor `speedMmPerS`, read by the scene and the simulator | estimated |
| Lift | A weighing platform lifts the container about 8 mm off the belts | estimated |

### Feeder (x = 250)
- Vertical tube holding nested empty containers above the belt (see Supply).
- Infeed gate: a push-pull 12 V solenoid at the bottom of the magazine releases one container
  (parts list 2026-11-09; it replaces the two-finger release). The PLC switches it through a relay.
- The arrival sensor after the feeder counts containers (0 or 2 = fault).
Status: concept confirmed, sizes estimated.

### Filling (x = 550, in front of the vessel)
- Lift-and-weigh: a small platform in the gap between the belts, on a 1 kg load cell, lifted by an
  MG996R servo (rack and pinion), so the container leaves the belts while it is filled.
- Nozzle above the container, fed by the filling pump drawing from the vessel.
- **Loss-in-weight** (owner, step 17): the vessel scale decides when the pump stops; the platform
  scale under the container cross-checks.
- No dripping allowed after stop.
| Item | Value | Status |
|---|---|---|
| Filling pump | R385 12 V diaphragm (parts list 2026-11-09) | confirmed |
| Vessel bottom vs container top | 50 mm | confirmed |
| Platform | 36 x 36 (fits through the 40 mm gap, under the 79 mm base) | estimated |
| Nozzle | 10 mm above the lifted container's top | estimated |

### Check + Reject + Cap (x = 850)
Sequence (owner, step 17):
1. Container arrives, belt stops.
2. Platform lifts (MG996R servo), the weight settles and is read.
3. Good weight: one lid drops from the lid magazine (a drop gate opened by an MG90S servo, through
   a guide funnel) **while the container is still lifted**. Then the platform lowers, and the lid
   press (a 12 V car central-lock actuator with a printed head) snaps the lid on; its KW12 end
   switch confirms the press reached the end.
4. Bad weight: the platform lowers and a servo pusher (MG996R) pushes the container off the belt,
   toward the reject bin on the front side.
5. Belt continues.

Interlock: pressing is forbidden while the platform is up (protects the 1 kg load cell). The press
force goes through the container into the belts and rails.
Status: concept confirmed, sizes estimated.

### End of the belt
Until the tray is built (owner, step 17): each good container stops at the end of the belt. While
the end sensor sees it, the belt stops; a worker takes it away (the simulator: after a random 3
to 8 s, estimated). Then the belt moves on.

### Batch tray (end of belt), not installed
- As in the parts list (owner, step 17): a 6-slot tray that slides sideways on a rail (MGN12H rail,
  GT2 belt, pulley and idler), driven by a NEMA 17 stepper with a TMC2209 and a KW12 home switch,
  run by the deferred station 4 ESP32. All deferred: `installed: false`.
- Still open (doc 05): 6 slots are fewer than the largest batch (10), and the tray needs more
  travel than the 800 mm table gives (drawn at home with slot 1 at the belt, it sticks out
  behind the table).

### Reject bin
In front of the check station, viewer side. 140 x 100 x 110: confirmed. It is 100 mm deep,
narrower than the 113 mm container top (open item, doc 05).

---

## Section: Control cabinet (the control panel)

Right-back corner, raised above the table (above liquid level), cables enter from below through
cable glands. White outside (owner, step 17). Status: confirmed.

Door (front), as in the parts list (owner, step 17):
- Emergency stop: red mushroom, latching, 2 NC, 22 mm. Through the contactor it cuts the 12 V
  motor line; the ESP32 stations stay powered.
- Start (green, normally open), Stop (red, normally closed), Reset (yellow, normally open): LA38-11
  22 mm. Reset replaces the alarm acknowledge button.
- Tower light with buzzer, LTA-205J 24 V: green, yellow, red.
- No auto/manual selector, no screen and no temperature sensor (owner, step 17): the laptop is
  the screen.

Inside, on the back panel (positions estimated):
- PLC Inovance Easy320-0808TN: 8 digital inputs, 8 transistor outputs, 1 RS485, 2 Ethernet; with a
  GE20-4DI card (4 more inputs, 12 in all).
- Relay board, 4 channels, 24 V, low-level trigger: the conveyor motor and the infeed solenoid.
- Contactor CJX2-0910Z (24 V DC coil): cuts the 12 V motor line on e-stop.
- DIN rail, terminals and fuse holders.
- Mean Well LRS-150-12 (the 12 V motor line, after the contactor) and LRS-75-24 (24 V for the
  PLC, the sensors and the ESP32s).
- The three ESP32s on a second DIN rail (see Stations below).
- Raspberry Pi 5 4 GB with its 27 W supply and an RTC battery (currently dead: repair or replace).

Next to the cabinet (owner, step 17): the Ethernet switch (TP-Link TL-SF1005D) and the laptop that
runs the web app.

Cabinet: outer 300 x 450 x 220, 18 mm walls, hollow.

---

## Stations: the zones the ESP32s control (owner, step 17)

"Station 1" names a zone and the ESP32 that controls it, not a box at the line. The three ESP32s
sit in the control panel on a second DIN rail (owner, step 17: option a). Each: an ESP32 DevKit
V1, a MAX3485 RS485 module, a terminal board and an LM2596 buck (24 to 5 V, stays on during an
e-stop), in a printed DIN enclosure. Sizes and positions estimated: the three fit beside the
24 V supply only if each enclosure is about 48 mm wide (open item, doc 05).

| Station | Zone | What its ESP32 runs |
|---|---|---|
| 1 | Dyes (mixing & colour) | The 4 dye scales (HX711) and the 4 dye pumps (TMC2209) |
| 2 | Tanks, mixing, filling | The big tank's level sensor, the vessel and filling scales, the base, water, filling, drain and sample pumps (D4184 MOSFET modules, the sample pump's reversing driver), the mixer, the filling lift servo (XL4015 buck) |
| 3 | Check, reject, cap | The check scale and lift servo, the reject pusher, the lid-drop servo, the lid press (2-channel relay), an XL4015 buck for the servos |
| 4 | Tray (deferred, not drawn) | The tray stepper and its home switch |

HX711 boards stay next to their load cells, not in the panel.

## Connections (drawn in the scene; owner, step 17)

All paths estimated, in `machine.json` → `links`.

| From | To | Link |
|---|---|---|
| PLC | Station 1, 2, 3 ESP32s | RS485: one daisy-chained twisted pair inside the panel, PLC → 1 → 2 → 3, 120 Ω at both ends |
| PLC, Raspberry Pi, laptop | Ethernet switch | Ethernet (Cat6) |
| Dye bottles (x4) | Mixing vessel | Peristaltic pump tubes |
| Big tank | Mixing vessel | Base pump |
| Rinse water container | Mixing vessel | Water pump |
| Mixing vessel | Flow cell | Sample pump (both ways), plus the vent back to the lid |
| Mixing vessel | Container at filling | Filling pump |
| Mixing vessel | Drain bucket | Drain pump |

---

## Load cell count

| Scale | Cell | Status |
|---|---|---|
| Mixing vessel | 5 kg | owned |
| Dye bottles x4 | 1 kg each (parts list 2026-11-09) | 3 owned |
| Filling | 1 kg | to buy |
| Check | 1 kg | to buy |

## Pump count

| Pump | Type |
|---|---|
| Base | R385 diaphragm (owned) |
| Water | R385 diaphragm |
| Drain | R385 diaphragm |
| Filling | R385 diaphragm |
| Dye x4 | NEMA17 + printed peristaltic head |
| Sample | DC, reversible |
