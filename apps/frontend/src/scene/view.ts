/**
 * The camera on the line overview and its limits (doc 03: orbit with limits,
 * never under the table). Scene units are metres; see frame.ts.
 */
import type { Vec3 } from './frame';

/** The line from the front, a little above: the committee's view. */
export const DEFAULT_VIEW: { position: Vec3; target: Vec3 } = {
  position: [0.9, 1.05, 1.15],
  target: [0.9, 0.12, -0.35],
};

export const ORBIT_LIMITS = {
  minDistance: 0.25,
  maxDistance: 4,
  /** From straight above (0) to just above the table plane: never from below. */
  minPolarAngle: 0.05,
  maxPolarAngle: Math.PI / 2 - 0.12,
  /** The point the camera turns around stays over the table (x, z) and near its height (y). */
  targetBounds: { min: [-0.2, -0.3, -1.0] as Vec3, max: [2.0, 0.9, 0.2] as Vec3 },
};

/** Keeps a point inside the bounds (the orbit target, after panning). */
export function clampTarget(point: Vec3): Vec3 {
  const { min, max } = ORBIT_LIMITS.targetBounds;
  return point.map((v, i) => Math.min(max[i] ?? v, Math.max(min[i] ?? v, v))) as Vec3;
}
