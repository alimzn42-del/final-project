# Questions and choices: night of 2026-10-28 (steps 12 and 13)

Owner's rule for the night: easy to undo → my recommendation is taken and noted here; hard to
undo or changes a decision in the docs → skipped and noted here. Delete this file once reviewed.

## Step 12: 3D scene (branch `step-12-3d-scene`)

Taken (easy to undo):

1. **Colours of materials** for the 89 of 103 parts that set no `color` of their own: varnished
   MDF `#c8a97e`, see-through clear plastic, grey PLA for printed parts, green for electronics,
   steel for metal, dark rubber. One table in `apps/frontend/src/scene/looks.ts`. Brand blue is
   never used for materials (it is the hover glow).
2. **A floor** under the table at its height (750 mm), so the drain bucket stands on something.
   Table legs are not drawn: they are not in `machine.json`, and doc 03 says not to invent parts.
3. **"Pending" tags on the line overview** appear only for the section under the pointer: 17 tags
   at once covered the line. On section, sub-section and part pages (step 13) they are always shown.
4. **Hover highlight**: brand light blue on the surfaces plus blue edge lines. A thicker outline
   effect broke in Chrome's software renderer, so it was dropped.
5. **On the line page, a part leads to its section**: hovering any part lights up its whole
   section (doc 03: clicking on level 1 opens a section).

Facts, not choices:

6. `machine.json`'s frame (x right, y up, z away from the viewer) is left-handed; three.js is
   right-handed. The scene flips z, otherwise the line would appear mirrored (cabinet on the left).
   Doc 02 is unchanged; a test checks the view from the front.
7. **Frame rate** measured in Chrome at phone size (390 x 844) with the CPU slowed 4x: about
   34 frames/s while orbiting. Chrome here draws WebGL in software, so a real phone is still the
   real check (step 12's "frame rate on a phone").
8. The manager account has the saved theme "dark" (set during your step 11 review, I think). I left
   it; it goes with the manager reset at the end of the night.
