# 02 — Line Specification

Every part of the physical line, where it sits, what it is made of, and its sensors.
`config/machine.json` encodes the same data for code. If the two disagree, ask the owner.

## Status labels

| Status | Meaning |
|---|---|
| `confirmed` | Decided and measured. Use as is. |
| `estimated` | Decided in principle, number is a best guess. Keep it configurable. |
| `pending` | Not decided yet. Show a labeled placeholder, do not invent details. |

## Coordinate system (for the scene)

- Units: millimeters, grams.
- Origin: front-left corner of the table top.
- `x` to the right along the conveyor, `y` up, `z` toward the back (wall side).
- Each component has an `anchor`:
  - `bottom` (default): `position` is the center of the footprint at the bottom face.
  - `center`: `position` is the geometric center (used for rotated parts: rollers, door buttons).
- Rotation is applied about the anchor point, in degrees, order X then Y then Z.
- Cylinders have their axis along `y` before rotation.
- `hollow: true` boxes are drawn as walls of `wallThickness` (color box, cabinet). Child parts sit
  inside the inner volume.
- "Front" = committee / viewer side (low `z`). "Back" = wall side (high `z`).

## Liquids

Defined in `machine.json` → `liquids`:
- `base`: clear water, light blue tint, low opacity.
- `mix`: live color from the camera reading (L*a*b* converted to RGB); `hex` is the fallback.
- Dye tanks use their own `colorHex`.

## Global layout (top view)

```
z (back)
 800 +-------------------------------------------------------------+
     | [BIG TANK]  [PEDESTAL+VESSEL]  [CAMERA BOX][CONTROL CABINET] |
     |             (dye shelf above)                               |   drain bucket on floor, back-right
 450 |                                                             |
     |                                                       tray  |
 250 |==[FEEDER]======[FILLING]======[CHECK+CAP]=====>|  rail(z)  |
     |                                 [REJECT BOX]                |
   0 +-------------------------------------------------------------+
     0                                                          1800  x
```

- Back row, left to right: big base tank, mixing vessel on a pedestal with the dye shelf above it,
  camera box, control cabinet (right-back corner). Camera box touches the cabinet's left wall.
- Front row: conveyor, left to right: feeder, filling, check+reject+cap, batch tray at the end.
- Filling station sits directly in front of the mixing vessel (short filling hose).
- Reject box sits in front of the check station, on the viewer side.
- Drain bucket sits on the floor, back-right.
- All wood (MDF), all wood near liquids is varnished / waterproofed.

| Item | Value | Status |
|---|---|---|
| Table | 1800 x 800 mm, top at y=0, floor at y=-750 | estimated |
| Conveyor centerline | z = 250 | estimated |
| Belt top surface | y = 100 | estimated |

## Containers (product)

| Item | Value | Status |
|---|---|---|
| Type | Clear plastic cup, tapered (nests), rim lip, press-on lid | pending (market search) |
| Placeholder size | top Ø90, height 60, base Ø65 | estimated |
| Lid | press-on, flat preferred over dome | pending |
| Fill target | 300 g water per container | estimated |
| Batch | 6 containers | confirmed |
| Fallback | small metal paint tins if no suitable clear cup | pending |

Everything that depends on the container (belt width, feeder, lid magazine, press, pusher, weigh
platforms, nozzle height, tray slots) is `estimated` or `pending`.

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
| Low float | Float switch near the bottom | confirmed |

### Empty container magazine
Belongs to the Supply section in the UI. It is the vertical tube of nested empty containers that feeds
the conveyor. Its release mechanism belongs to the Conveyor / Feeder station.

---

## Section: Mixing & Color

### Pedestal
| Item | Value | Status |
|---|---|---|
| Purpose | Raise the vessel so its bottom is 50 mm above the container top | confirmed |
| Size | 300 x 300 footprint, height 151.3 (= 210 vessel bottom − 58.7 scale stack) | estimated |
| Position | x=550, z=600 | estimated |

### Mixing vessel scale (one scale)
Stack, bottom to top:
1. Bottom plate: MDF 18 mm, Ø240.
2. Spacer 1 (printed, 12.7 x 20 x 5 mm, 100% infill) under the **left** end of the load cell.
3. Load cell: bar type 5 kg, 80 x 12.7 x 12.7 mm, M4 holes.
4. Spacer 2 on top of the **right** end of the load cell.
5. Top plate: MDF 18 mm, Ø200, with a drawn centering circle (no ring).
6. Overload-stop screw under the top plate edge, about 1 mm gap.
7. HX711 board in a small printed box next to the scale.

Status: confirmed (dimensions of spacers estimated until hole spacing is measured).

### Mixing vessel
| Item | Value | Status |
|---|---|---|
| Shape | Clear plastic cylinder with screw lid | confirmed |
| Size | Ø160 x H230 (about 4.6 L) | confirmed |
| Mounting | Placed on the scale top plate, not fixed | confirmed |
| Anti-rotation | Pegs or rubber pad so mixer torque cannot turn it | pending |
| Working batch | about 2.0 L (6 x 300 g + about 0.2 L heel) | estimated |
| Lid | Used as a manifold: holes for all tubes and the mixer shaft | confirmed |
| Overflow float | Hangs from the lid | confirmed |

Tubes entering through the lid: 4 dye lines, base line, sample line, sample vent return, drain suction,
filling suction. All soft silicone with a slack loop, so they do not pull the weighed vessel.

### Mixer
| Item | Value | Status |
|---|---|---|
| Concept | Motor mounted on the vessel lid, long shaft inside, blades at the end | confirmed |
| Detailed design | Being designed by a teammate | pending |
| Blade height | about 20 mm above the vessel bottom | estimated |
| Rule | Stop mixing before weighing and before taking a sample | confirmed |
| Sensor | Encoder speed (rpm) | estimated |

### Dye shelf
| Item | Value | Status |
|---|---|---|
| Purpose | Holds 4 dye tanks above the mixing vessel | confirmed |
| Material | MDF 18 mm | confirmed |
| Size | 480 x 200, on two posts at the back corners | estimated |
| Dye positions | x = 377.5, 492.5, 607.5, 722.5 (115 mm pitch), z = 650 | estimated |
| Height | Bottom of shelf about 100 mm above the top of the vessel **and its mixer motor** | estimated |
| Pumps | 4 dye pumps mounted under the front edge of the shelf | confirmed |

Gap to flag: the mixer motor now sits on the vessel lid, under the shelf. Shelf height must clear it.
Confirm with the teammate's mixer design.

### Dye tanks (x4: cyan, magenta, yellow, black)
| Item | Value | Status |
|---|---|---|
| Shape | Clear cylinders, same style as the vessel, smaller | confirmed |
| Size | Ø90 x H110 (about 700 ml, fits 1 kg cell) or Ø100 x H130 (about 1 L, needs 2 kg cell) | pending |
| Order on shelf | left to right: cyan, magenta, yellow, black | estimated |
| Outlet | Side wall near the bottom, facing front toward the pumps | confirmed |
| Scale | Each tank on its own small scale (same stack as the vessel, Ø100 plates, 15 mm gap between neighbours) | confirmed |
| Dye | Food dye diluted 1:9 in distilled water, opaque bottle | confirmed |
| Black | Shown and simulated as active from day one; hardware wired later | confirmed |

Possible colors: CMY mixes give green (C+Y), red/orange (M+Y), blue/violet (C+M), browns (all three).
Black gives true black, greys and cleaner dark shades. White is not possible (base is clear).

### Dye pumps (x4)
| Item | Value | Status |
|---|---|---|
| Type | Peristaltic, 3D-printed head on NEMA17 stepper | confirmed |
| Driver | TMC2209 | confirmed |
| Bearings | 695ZZ (5 x 13 x 4 mm), per the chosen printed design | confirmed |
| Dosing | By volume: steps x calibrated grams-per-step | confirmed |
| Signals | steps, speed, driver load, running | confirmed |

### Base pump
R385 12 V diaphragm pump, big tank to vessel, stops on vessel weight. Signals: running, current.
Status: confirmed.

### Drain pump
Second R385, vessel to drain bucket, runs until the vessel reads empty weight (with timeout).
Status: confirmed.

### Color box (camera box)
Closed box, matte black inside, next to the vessel, touching the control cabinet's left wall.
Inside, in a straight line:

| Order | Part | Notes | Status |
|---|---|---|---|
| 1 | Camera | Raspberry Pi Camera Module 3, printed mount, lens 120 mm from the cell | confirmed |
| 2 | Sample cell | Acrylic, flat parallel walls, inside 40 W x 60 H x 15 deep, 3 mm walls | estimated |
| 3 | Cell holder | Keeps the cell vertical and fixed | confirmed |
| 4 | Diffuser | Opal acrylic 80 x 80, 25 mm in front of the LEDs | estimated |
| 5 | LEDs | White LED panel, constant power | confirmed |

| Item | Value | Status |
|---|---|---|
| Box | outer 250 x 150 x 140, walls 6 mm MDF, inside about 238 x 138 x 128 | estimated |
| Sample cell ports | One port at the bottom center (fill and empty), one vent at the top | confirmed |
| Vent | Tube back up to the vessel lid, so overflow drips into the vessel | confirmed |
| Camera cable | 200 mm for now (Pi 5 22-pin to camera), longer later | confirmed |

### Sample pump
DC peristaltic, reversible. Forward fills the cell from the vessel; reverse empties it back into the
vessel. Same cycle with rinse water cleans the cell. Status: confirmed.

### Drain bucket
On the floor, back-right, 10 L or more, top float that blocks draining when full. Status: confirmed.

---

## Section: Conveyor

### Belt
| Item | Value | Status |
|---|---|---|
| Type | Two narrow parallel belts on the same rollers, one motor | confirmed |
| Support | A rigid rail under each belt, open gap between rails | confirmed |
| Length | x = 100 to 1350 | estimated |
| Belt width / gap | 25 mm each, 40 mm gap | estimated (depends on container base) |
| Speed control | Closed loop (PID) using an AS5600 encoder on an idler roller | confirmed |
| Arrival sensor | One per station | confirmed |

### Station 1: Feeder (x = 250)
- Vertical tube holding nested empty containers above the belt.
- Two fingers grab the rim lip; both on one rocking arm driven by one servo, so they can never be
  open at the same time. Lower finger releases the bottom container, upper finger holds the rest.
- The arrival sensor after the feeder counts containers (0 or 2 = fault).
Status: concept confirmed, dimensions pending (container).

### Station 2: Filling (x = 550, in front of the vessel)
- Lift-and-weigh: a small platform in the gap between the belts, on a 1 kg load cell, lifted by a
  servo so the container leaves the belts while weighing.
- Nozzle above the container, fed by the filling pump drawing from the vessel.
- Fill by weight. The vessel scale must drop by the same mass (cross-check).
- No dripping allowed after stop.
| Item | Value | Status |
|---|---|---|
| Filling pump | Peristaltic (preferred, can reverse a few steps to stop drips) or diaphragm + check valve | pending |
| Vessel bottom vs container top | 50 mm | confirmed |

### Station 3: Check + Reject + Cap (x = 850)
Sequence:
1. Container arrives, belt stops.
2. Platform lifts, weight settles and is read, platform lowers.
3. Bad weight: a servo pusher pushes the container sideways down a chute to the reject box (front side).
4. Good weight: one lid drops from a vertical lid magazine (same two-finger mechanism as the feeder)
   through a guide funnel; a press plate pushes it down.
5. Belt continues to the tray.

Interlock: pressing is forbidden while the platform is up (protects the 1 kg load cell). The press
force goes through the container into the belts and rails.
Status: concept confirmed, dimensions pending (container).

### Station 4: Batch tray (end of belt) — PENDING
- Intent: removable tray, 6 slots, one slot per container, a robot may later pick up the full tray.
- The linear sliding tray **does not fit**: to bring each of 6 slots (100 mm pitch) to the conveyor
  line at z=250, the tray must cover about z = −300 to 800 (about 1100 mm); the table is 800 deep.
- Mechanism to be decided with the supervisor. Render a static placeholder at the belt end.
- Do not model a rail or tray motor until decided.

### Reject box
In front of the check station, viewer side. Status: confirmed.

---

## Section: Control cabinet

Right-back corner, raised above the table (above liquid level), cables enter from below through
cable glands. Status: confirmed.

Door (front):
- Emergency stop (red mushroom, hardwired, cuts all motor/pump power).
- Start (green), Stop (normally closed), Alarm acknowledge.
- Auto / Manual selector.
- Stack lights green / yellow / red + buzzer.
- Screen.

Inside:
- PLC (model pending, supervisor sourcing; relay outputs allowed).
- Raspberry Pi 5 (camera, gateway).
- ESP32 on a screw-terminal adapter board.
- 12 V PSU, 5 V buck regulator, fuse per branch.
- 4x TMC2209 + tray stepper driver, DC motor drivers.

HX711 boards stay next to their load cells, not in the cabinet.

Cabinet: outer 300 x 450 x 220, 18 mm walls, hollow. Interior parts are mounted on the back panel,
positions are placeholders until the PLC is chosen.

---

## Load cell count

| Scale | Cell | Status |
|---|---|---|
| Mixing vessel | 5 kg | owned |
| Dye tanks x4 | 1 kg or 2 kg (depends on tank size) | 3 x 1 kg owned |
| Filling | 1 kg | to buy |
| Check | 1 kg | to buy |

## Pump count

| Pump | Type |
|---|---|
| Base | R385 diaphragm (owned) |
| Drain | R385 diaphragm (to buy) |
| Dye x4 | NEMA17 + printed peristaltic head |
| Sample | DC peristaltic, reversible |
| Filling | pending |
