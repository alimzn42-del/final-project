/** Each page frames its own subject (doc 03): the whole subject is on screen. */
import { type Machine, machineSchema } from '@mixline/shared';
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import raw from '../../../../config/machine.json';
import { pageScene, placeFromPath } from '../navigation/places';
import { boundsOf } from './frame';
import { FOV, viewFor } from './view';

const machine: Machine = machineSchema.parse(raw);

function cornersOnScreen(path: string, aspect: number): boolean {
  const place = placeFromPath(machine, path);
  if (!place) throw new Error(path);
  const bounds = boundsOf(pageScene(machine, place).subject);
  const view = viewFor(bounds, aspect);
  const camera = new PerspectiveCamera(FOV, aspect, 0.01, 50);
  camera.position.set(...view.position);
  camera.lookAt(new Vector3(...view.target));
  camera.updateMatrixWorld(true);
  const { min, max } = bounds;
  for (const x of [min.x, max.x])
    for (const y of [min.y, max.y])
      for (const z of [min.z, max.z]) {
        const p = new Vector3(x, y, z).project(camera);
        if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1 || p.z > 1) return false;
      }
  return true;
}

describe('framing per page', () => {
  it.each([
    ['a section', 'mixingColor'],
    ['a sub-section', 'conveyor/checkCap'],
    ['a big part', 'cabinet/part/cabinet'],
    ['a tiny part (the camera module)', 'mixingColor/color/camera'],
    ['a part on the floor (the drain bucket)', 'mixingColor/mixing/drainBucket'],
  ])('%s fits on a wide screen and on a phone', (_name, path) => {
    expect(cornersOnScreen(path, 16 / 9)).toBe(true);
    expect(cornersOnScreen(path, 390 / 600)).toBe(true);
  });
});
