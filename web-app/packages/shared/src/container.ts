/**
 * The container (machine.json `container`, owner step 17): a tapered round tub. The simulator and
 * the 3D scene both need its inside, to know how high a fill stands and how wide the liquid's
 * surface is there.
 *
 * The inside is a cone cut flat at both ends (a frustum): from the inside of the bottom up to
 * the underside of the lid. Its bottom radius is the outer base radius minus the wall; its top
 * radius is the body's outer top radius (the top diameter minus the rim on both sides) minus
 * the wall. 1 ml of water is 1 g and 1000 mm³.
 */
import type { ContainerConfig, ContainerSpec } from './machine.schema.js';

export type ContainerStatus = 'confirmed' | 'estimated';

/** Every field of the container, from whichever group holds it. */
export function containerSpec(container: ContainerConfig): ContainerSpec {
  return { ...container.confirmed, ...container.estimated } as ContainerSpec;
}

export function containerFieldStatus(
  container: ContainerConfig,
  field: keyof ContainerSpec,
): ContainerStatus {
  return container.confirmed[field] === undefined ? 'estimated' : 'confirmed';
}

export interface TubInside {
  /** Radius at the inside of the bottom, mm. */
  bottomRadius: number;
  /** Radius just under the lid, mm. */
  topRadius: number;
  /** From the inside of the bottom to the underside of the lid, mm. */
  height: number;
  /** Height of the inside bottom above the tub's outer bottom (the bottom's thickness), mm. */
  floor: number;
}

export function tubInside(spec: ContainerSpec): TubInside {
  return {
    bottomRadius: spec.baseDiameter / 2 - spec.wall,
    topRadius: (spec.topDiameter - 2 * spec.rimOverhang) / 2 - spec.wall,
    height: spec.height - spec.lidThickness - spec.wall,
    floor: spec.wall,
  };
}

/** The inside radius at height h above the inside bottom, mm. */
export function radiusAt(inside: TubInside, h: number): number {
  const k = Math.min(1, Math.max(0, h / inside.height));
  return inside.bottomRadius + (inside.topRadius - inside.bottomRadius) * k;
}

/** Millilitres held up to height h above the inside bottom (frustum: πh/3 · (r₀² + r₀r + r²)). */
export function volumeUpTo(inside: TubInside, h: number): number {
  const height = Math.min(inside.height, Math.max(0, h));
  const r0 = inside.bottomRadius;
  const r = radiusAt(inside, height);
  return (Math.PI * height * (r0 * r0 + r0 * r + r * r)) / 3 / 1000;
}

/** Millilitres the tub holds up to the underside of the lid. */
export const brimVolume = (inside: TubInside) => volumeUpTo(inside, inside.height);

/**
 * How high `ml` stands above the inside bottom, mm: the volume grows with the height, so halving
 * the interval 50 times finds it to far below a micrometre. At most the inside height.
 */
export function fillHeight(inside: TubInside, ml: number): number {
  if (ml <= 0) return 0;
  if (ml >= brimVolume(inside)) return inside.height;
  let low = 0;
  let high = inside.height;
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    if (volumeUpTo(inside, mid) < ml) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}
