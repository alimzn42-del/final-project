# 06 — Brand and Visual Design

## The company

- Name: **ALMAS** (Arabic: ألماس, "diamond").
- Tagline: Automation | Robotics | Artificial Intelligence
  (التحكم الآلي | الروبوتات | الذكاء الاصطناعي). Both are in the locale files (`brand.*`).
- Logo: `docs/brand/almas-logo.jpg` (640 px raster). A faceted diamond built from blue circuit lines,
  with a robot arm on its left facet and an "AI" chip in the center, above the Arabic and Latin
  wordmarks. Ask the owner for an SVG or high-resolution version before using it large.
- Second version: `docs/brand/almas-logo-v2.jpg` (589 px raster, sharper, same dark background).
- Until the owner sends an SVG or a transparent PNG:
  - Use the JPG logo only on dark backgrounds (its dark background is part of the image).
  - In the header, leave a clearly marked placeholder where the diamond-only mark will go.

## Who uses the app

Factory managers and operators watching a live production line, and later customers ordering paint.
It is an industrial monitoring tool (SCADA / HMI style), shown to a graduation committee. It must look
professional and calm, readable at a glance, and impressive without being flashy.

## Direction

Take the logo's world: a precise, faceted diamond made of light on a dark steel background.

- **Dark theme** close to the logo's charcoal background, and a **light theme** (for daylight /
  projectors), built from the same tokens. Which one shows (owner, step 11): the browser's setting
  until the user picks one; the choice is saved with the account, like the language.
- **Facets as a quiet motif**: thin angled lines, chamfered corners on panels, a faceted outline on
  the line overview. Use it sparingly; never decorate data.
- **Blue is the brand, not a state.** Status colors stay separate (green / amber / red / grey) so a
  fault is never confused with brand blue.
- **The 3D scene is the hero.** Panels and text frame it and stay out of its way.

## Color tokens (starting values, derived from the logo)

| Token | Dark theme | Light theme | Use |
|---|---|---|---|
| `bg` | `#14181F` | `#F3F5F8` | page background |
| `surface` | `#1C222C` | `#FFFFFF` | panels |
| `line` | `#2C3542` | `#D6DCE4` | borders, dividers |
| `text` | `#E8EDF3` | `#141A22` | main text |
| `textMuted` | `#9AA6B4` | `#5B6776` | secondary text |
| `brand` | `#2E9BFF` | `#1677D2` | brand blue: links, focus, selection |
| `brandGlow` | `#5FD3FF` | `#2E9BFF` | highlights, hover glow in the scene |
| `steel` | `#C3CBD4` | `#8A96A3` | metallic accents (logo silver) |
| `ok` | `#3CC27A` | `#1E9E5A` | state ok |
| `warning` | `#F2B533` | `#C98A00` | state warning |
| `fault` | `#F0524F` | `#D23431` | state fault |
| `offline` | `#6B7684` | `#9AA4B0` | state offline |

Check contrast (WCAG AA) for text on `bg` and `surface` in both themes.

## Type

- One family for Latin and Arabic with matching weights: **IBM Plex Sans** + **IBM Plex Sans Arabic**
  (Google Fonts). Technical, clean, made for interfaces.
- **IBM Plex Mono** for live numbers, with tabular figures so values do not jump.
- Wordmark: use the logo image, do not re-type "ALMAS".

## Layout

- Header: logo mark + "ALMAS" wordmark, page title, breadcrumbs, SIMULATION badge, language switch,
  user menu.
- Line and section pages: 3D scene fills the main area; a slim side panel lists children with their
  state chips.
- Component page: 3D close-up and a values panel side by side on desktop, stacked on phones.
- Login and sign-up: the current theme's background (they follow the browser's setting, owner,
  step 11), centered logo, a faint faceted diamond pattern behind the form.

## Motion

- Short and purposeful: camera glides between levels, state changes pulse once.
- Respect `prefers-reduced-motion`.
