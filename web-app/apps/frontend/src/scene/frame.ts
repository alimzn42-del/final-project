/**
 * From machine.json to the 3D scene (docs/02-line-spec.md "Coordinate system").
 *
 * - machine.json is in millimetres; the scene uses metres, so three.js's
 *   defaults (camera distances, lights) fit the size of the line.
 * - machine.json's frame is seen from the front: x to the right, y up, z away
 *   from the viewer (toward the wall). That is a left-handed frame; three.js is
 *   right-handed. So the scene flips z (the back of the table is at negative z),
 *   and a rotation about x or y turns the other way. Without this the whole
 *   line would appear mirrored (the cabinet on the left).
 * - Each part is a group placed at its anchor and turned about it (order X, Y,
 *   Z); its mesh sits inside the group so that the anchor is the centre of the
 *   bottom face (anchor "bottom") or the centre (anchor "center").
 */
import type { MachineComponent } from '@mixline/shared';
import { Box3, Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three';

export const MM = 0.001;

export type Vec3 = [number, number, number];

/** A machine.json point (mm) as a scene point (m). */
export function toScene(point: readonly number[]): Vec3 {
  const [x = 0, y = 0, z = 0] = point;
  return [x * MM, y * MM, -z * MM];
}

/** machine.json rotation (degrees, X then Y then Z) in the scene's frame. */
export function sceneRotation(degrees: readonly number[]): Euler {
  const [x = 0, y = 0, z = 0] = degrees;
  return new Euler(-MathUtils.degToRad(x), -MathUtils.degToRad(y), MathUtils.degToRad(z), 'XYZ');
}

/** The part's outer size in metres: [x, y, z]; a cylinder is [diameter, height, diameter]. */
export function sceneSize(c: MachineComponent): Vec3 {
  const g = c.geometry;
  const [x, y, z] = g.shape === 'box' ? g.size : [g.diameter, g.height, g.diameter];
  return [x * MM, y * MM, z * MM];
}

export interface PartFrame {
  /** Where the part's group sits (its anchor), in metres. */
  anchor: Vec3;
  rotation: Euler;
  /** The geometry's centre inside the group. */
  offset: Vec3;
  size: Vec3;
}

export function partFrame(c: MachineComponent): PartFrame {
  const size = sceneSize(c);
  return {
    anchor: toScene(c.position),
    rotation: sceneRotation(c.rotationDeg),
    offset: [0, c.anchor === 'bottom' ? size[1] / 2 : 0, 0],
    size,
  };
}

/** The box around a part in the scene (turned parts included). */
export function partBounds(c: MachineComponent): Box3 {
  const f = partFrame(c);
  const half = new Vector3(...f.size).multiplyScalar(0.5);
  const center = new Vector3(...f.offset);
  const placed = new Matrix4().compose(
    new Vector3(...f.anchor),
    new Quaternion().setFromEuler(f.rotation),
    new Vector3(1, 1, 1),
  );
  return new Box3(center.clone().sub(half), center.clone().add(half)).applyMatrix4(placed);
}

/** The box around several parts (what a page frames). */
export function boundsOf(parts: readonly MachineComponent[]): Box3 {
  const box = new Box3();
  for (const c of parts) box.union(partBounds(c));
  return box;
}

export interface Wall {
  /** Centre of the wall, relative to the box's centre. */
  center: Vec3;
  size: Vec3;
}

/**
 * The six walls of a hollow box (doc 02: drawn as walls of `wallThickness`).
 * Parts inside sit in the inner volume, which stays empty.
 */
export function hollowWalls([x, y, z]: Vec3, thicknessMm: number): Wall[] {
  const t = thicknessMm * MM;
  return [
    { center: [0, -(y - t) / 2, 0], size: [x, t, z] }, // bottom
    { center: [0, (y - t) / 2, 0], size: [x, t, z] }, // top
    { center: [-(x - t) / 2, 0, 0], size: [t, y - 2 * t, z] }, // left
    { center: [(x - t) / 2, 0, 0], size: [t, y - 2 * t, z] }, // right
    { center: [0, 0, (z - t) / 2], size: [x - 2 * t, y - 2 * t, t] }, // front (viewer side)
    { center: [0, 0, -(z - t) / 2], size: [x - 2 * t, y - 2 * t, t] }, // back
  ];
}
