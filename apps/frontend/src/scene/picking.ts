/**
 * Which part the pointer means. A see-through box (owner, step 12) lets the
 * pointer through to a part behind it that leads somewhere else: on the camera
 * box's sub-section page, a click on the camera hits the box's wall first.
 */
import type { Object3D } from 'three';

import type { Target } from '../navigation/places';

/** The part a scene object belongs to: its nearest group named after a part with a target. */
export function partIdOf(object: Object3D, ids: ReadonlySet<string>): string | undefined {
  for (let o: Object3D | null = object; o; o = o.parent) if (ids.has(o.name)) return o.name;
  return undefined;
}

export function passesThrough(
  ownId: string,
  hits: readonly { object: Object3D }[],
  targets: ReadonlyMap<string, Target>,
  seeThrough: ReadonlySet<string>,
): boolean {
  if (!seeThrough.has(ownId)) return false;
  const own = targets.get(ownId)?.path;
  const ids = new Set(targets.keys());
  return hits.some(({ object }) => {
    const id = partIdOf(object, ids);
    return id !== undefined && id !== ownId && targets.get(id)?.path !== own;
  });
}
