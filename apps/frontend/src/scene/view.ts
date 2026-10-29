/**
 * The camera (doc 03: orbit with limits, never under the table; each page
 * frames its own subject). Scene units are metres; see frame.ts.
 */
import { type Box3, MathUtils, Sphere, Vector3 } from 'three';

import type { Vec3 } from './frame';

export interface View {
  position: Vec3;
  target: Vec3;
}

/** The line from the front, a little above: the committee's view. */
export const DEFAULT_VIEW: View = {
  position: [0.9, 1.05, 1.15],
  target: [0.9, 0.12, -0.35],
};

export const FOV = 40;

/** How long the camera glides from one page's view to the next (step 13). */
export const GLIDE_MS = 700;

export const ORBIT_LIMITS = {
  /** Close enough for the smallest parts (a 25 mm camera module). */
  minDistance: 0.05,
  maxDistance: 4,
  /** From straight above (0) to just above the table plane: never from below. */
  minPolarAngle: 0.05,
  maxPolarAngle: Math.PI / 2 - 0.12,
  /** The point the camera turns around stays over the table (x, z), from the floor to the shelf (y). */
  targetBounds: { min: [-0.2, -0.8, -1.0] as Vec3, max: [2.0, 0.9, 0.2] as Vec3 },
};

/** Keeps a point inside the bounds (the orbit target, after panning). */
export function clampTarget(point: readonly number[]): Vec3 {
  const { min, max } = ORBIT_LIMITS.targetBounds;
  return [0, 1, 2].map((i) => {
    const v = point[i] ?? 0;
    return Math.min(max[i] ?? v, Math.max(min[i] ?? v, v));
  }) as Vec3;
}

/**
 * A view that shows everything in `bounds`, from the same direction as the
 * default view (front, a little above), so every page feels like the same line.
 */
export function viewFor(bounds: Box3, aspect: number, fovDeg: number = FOV): View {
  const sphere = bounds.getBoundingSphere(new Sphere());
  const vertical = MathUtils.degToRad(fovDeg);
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
  const fit = Math.min(vertical, horizontal);
  const distance = MathUtils.clamp(
    (sphere.radius / Math.sin(fit / 2)) * 1.08,
    ORBIT_LIMITS.minDistance,
    ORBIT_LIMITS.maxDistance,
  );
  const direction = new Vector3(...DEFAULT_VIEW.position)
    .sub(new Vector3(...DEFAULT_VIEW.target))
    .normalize();
  const target = sphere.center;
  const position = target.clone().add(direction.multiplyScalar(distance));
  return { position: position.toArray(), target: clampTarget(target.toArray()) };
}
