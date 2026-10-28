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

## Step 13: navigation (branch `step-13-navigation`, built on step 12)

Taken (easy to undo):

9. **Phones (no hover)**: the first tap on a part lights it and shows its name with "Tap again to
   open"; a second tap opens it. With a mouse, hover shows the name and one click opens.
10. **A drag is not a click**: releasing the pointer more than 6 px from where it was pressed only
    turns the view.
11. **Section, sub-section and part pages draw only their subject** (doc 03: "shows only that
    part"), plus the table as a faint ghost for orientation; on a part's page the box around it
    (camera box, vessel...) is a faint ghost too. Ghosts never react to the pointer.
12. **A part's page also shows the parts grouped under it** (the vessel with its lid, mixer and
    float), each clickable to its own page.
13. **"Pending" tags**: on the line and section pages only for what the pointer lights up (the four
    dye tanks' tags overlapped); always from the sub-section level down. Replaces choice 3.
14. **See-through boxes get thin edge lines**, so the dark camera box keeps its shape when its walls
    are see-through.
15. **A list beside the 3D view** (doc 06: "a slim side panel lists children"; state chips come in
    step 14): it makes every page reachable without the 3D view (keyboard, screen readers). On a
    part's page it shows the status, the box it belongs to, the parts inside, and its sensors.
16. **Breadcrumbs in the header** (doc 06), the current page as the title; on phones they take
    their own row. While the line data loads, the header shows "Line".
17. **Camera**: every page is framed from the same direction as the line view (front, a little
    above), so the line always looks the same way round; glide 0.7 s, none with reduced motion.
18. **Arabic `L*`, `a*`, `b*`**: in right-to-left text the "*" jumped before the letter ("*L"). The
    three Arabic texts now carry invisible direction marks around the term (U+2066 ... U+2069);
    the visible text is unchanged. Checked in a zoomed screenshot.

To look at (not changed, your text):

19. `part.colorBox` is "Color box" in English but "صندوق الكاميرا" (camera box) in Arabic; doc 02
    calls it "Color box (camera box)". Pick one name for both languages?
