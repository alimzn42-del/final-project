/**
 * How parts look in the scene. Physical colours of the materials (machine.json
 * `material`), used when a part sets no `color` of its own. These are not brand
 * colours: blue stays for the brand and the hover glow (docs/06-brand.md).
 */
import type { Machine, MachineComponent, State } from '@mixline/shared';

type Material = MachineComponent['material'];

export interface Look {
  color: string;
  opacity: number;
  metalness: number;
  roughness: number;
}

export const MATERIAL_LOOKS: Record<Material, Look> = {
  // Varnished MDF.
  wood: { color: '#c8a97e', opacity: 1, metalness: 0, roughness: 0.8 },
  // Tanks and the vessel: see-through, so the liquid shows.
  clearPlastic: { color: '#dcebf5', opacity: 0.22, metalness: 0, roughness: 0.1 },
  plastic: { color: '#e3e6ea', opacity: 1, metalness: 0, roughness: 0.5 },
  metal: { color: '#aeb6bf', opacity: 1, metalness: 0.8, roughness: 0.35 },
  // Sample cell and diffuser.
  acrylic: { color: '#f2f6f8', opacity: 0.5, metalness: 0, roughness: 0.2 },
  // 3D-printed PLA.
  printed: { color: '#d3d9df', opacity: 1, metalness: 0, roughness: 0.7 },
  electronics: { color: '#2f5d50', opacity: 1, metalness: 0.1, roughness: 0.6 },
  rubber: { color: '#2a2a2a', opacity: 1, metalness: 0, roughness: 0.9 },
};

/** A pending part is a placeholder: see-through, never solid (doc 03). */
export const PENDING_OPACITY = 0.35;
/** The walls of a closed box when its inside is the subject of the page (owner, step 12). */
export const SEE_THROUGH_OPACITY = 0.14;
/** Parts drawn only for orientation (the table under a section, the box around a part). */
export const GHOST_OPACITY = 0.18;

export function partLook(
  c: MachineComponent,
  { seeThrough = false, ghost = false }: { seeThrough?: boolean; ghost?: boolean } = {},
): Look {
  const base = MATERIAL_LOOKS[c.material];
  let opacity = base.opacity;
  if (c.status === 'pending') opacity = Math.min(opacity, PENDING_OPACITY);
  if (seeThrough) opacity = Math.min(opacity, SEE_THROUGH_OPACITY);
  if (ghost) opacity = Math.min(opacity, GHOST_OPACITY);
  return { ...base, color: c.color ?? base.color, opacity };
}

/** State colours from tokens.css (docs/06-brand.md); never the brand blue. */
export interface StateColors {
  ok: string;
  warning: string;
  fault: string;
  offline: string;
}

/** The dark theme's values, until the page's tokens are read (and in tests). */
export const DEFAULT_STATE_COLORS: StateColors = {
  ok: '#3cc27a',
  warning: '#f2b533',
  fault: '#f0524f',
  offline: '#6b7684',
};

/**
 * How a state shows on a part (doc 03 "State colors"): fault and warning glow and are outlined
 * in their colour; offline is grey and dimmed; ok and none keep the normal look. `glow` is the
 * part's colour and strength from its state; undefined = no state glow.
 */
export function stateLook(
  state: State | undefined,
  colors: StateColors,
): { glow?: string; outline?: string; grey?: string } {
  if (state === 'fault' || state === 'warning')
    return { glow: colors[state], outline: colors[state] };
  if (state === 'offline') return { grey: colors.offline };
  return {};
}

/** One pulse when a state changes (docs/06-brand.md "Motion"): extra glow over 0..1 of its time. */
export const PULSE_MS = 900;
export function pulseBoost(progress: number): number {
  if (progress <= 0 || progress >= 1) return 0;
  return 0.9 * Math.sin(Math.PI * progress);
}

/** The liquid inside a tank or the vessel (doc 02 "Liquids"); the mix colour turns live in step 14. */
export function liquidLook(
  machine: Machine,
  liquid: { colorRef?: 'base' | 'mix'; colorHex?: string },
): { color: string; opacity: number } {
  if (liquid.colorHex) return { color: liquid.colorHex, opacity: 0.9 };
  const ref = machine.liquids[liquid.colorRef ?? 'base'];
  return { color: ref.hex, opacity: ref.opacity };
}
