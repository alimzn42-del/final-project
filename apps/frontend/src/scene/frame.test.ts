/**
 * Transform tests on known parts of the real machine.json (plan step 12):
 * where each part ends up in the scene, seen from the viewer's side.
 */
import { type Machine, machineSchema } from '@mixline/shared';
import { Box3, BoxGeometry, Group, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import raw from '../../../../config/machine.json';
import { hollowWalls, partFrame, toScene } from './frame';
import { DEFAULT_VIEW } from './view';

const machine: Machine = machineSchema.parse(raw);
const part = (id: string) => {
  const c = machine.components.find((x) => x.id === id);
  if (!c) throw new Error(`no part ${id}`);
  return c;
};

/** The part as the scene builds it: a group at the anchor, a box mesh at the offset. */
function worldBox(id: string): Box3 {
  const f = partFrame(part(id));
  const group = new Group();
  group.position.set(...f.anchor);
  group.rotation.copy(f.rotation);
  const mesh = new Mesh(new BoxGeometry(...f.size));
  mesh.position.set(...f.offset);
  group.add(mesh);
  group.updateMatrixWorld(true);
  return new Box3().setFromObject(mesh);
}

const close = (a: number, b: number) => {
  expect(a).toBeCloseTo(b, 6);
};

describe('from machine.json to the scene', () => {
  it('millimetres become metres; the back of the table is at negative z', () => {
    expect(toScene([1800, 100, 800])).toEqual([1.8, 0.1, -0.8]);
  });

  it('the table top is at y = 0 and covers 1.8 x 0.8 m', () => {
    const b = worldBox('table');
    close(b.max.y, 0);
    close(b.min.x, 0);
    close(b.max.x, 1.8);
    close(b.min.z, -0.8);
    close(b.max.z, 0);
  });

  it('anchor "bottom": the part stands on its position (the vessel on its pedestal)', () => {
    const b = worldBox('vessel');
    close(b.min.y, 0.21);
    close(b.max.y, 0.21 + 0.23);
    close((b.min.x + b.max.x) / 2, 0.55);
    close((b.min.z + b.max.z) / 2, -0.6);
  });

  it('anchor "center" and a 90° turn about x: the drive roller lies across the belt', () => {
    const b = worldBox('rollerDrive');
    const size = b.getSize(new Vector3());
    close((b.min.y + b.max.y) / 2, 0.085);
    close(size.z, 0.13); // its length now runs front to back
    close(size.y, 0.03);
  });

  it('a hollow box: six walls that fill exactly its outer size', () => {
    const cabinet = part('cabinet');
    const f = partFrame(cabinet);
    const g = cabinet.geometry;
    const walls = hollowWalls(f.size, g.shape === 'box' ? (g.wallThickness ?? 0) : 0);
    const bounds = new Box3();
    for (const w of walls) {
      const half = new Vector3(...w.size).multiplyScalar(0.5);
      const center = new Vector3(...w.center);
      bounds.union(new Box3(center.clone().sub(half), center.clone().add(half)));
    }
    const size = bounds.getSize(new Vector3());
    close(size.x, 0.3);
    close(size.y, 0.45);
    close(size.z, 0.22);
    expect(walls).toHaveLength(6);
  });

  it('seen from the default view, the line is not mirrored: cabinet right-back, conveyor in front', () => {
    const camera = new PerspectiveCamera(40, 16 / 9, 0.05, 50);
    camera.position.set(...DEFAULT_VIEW.position);
    camera.lookAt(new Vector3(...DEFAULT_VIEW.target));
    camera.updateMatrixWorld(true);
    const onScreen = (id: string) => worldBox(id).getCenter(new Vector3()).project(camera);
    const distance = (id: string) =>
      worldBox(id).getCenter(new Vector3()).distanceTo(camera.position);

    expect(onScreen('cabinet').x).toBeGreaterThan(0.2); // right half of the screen
    expect(onScreen('bigTank').x).toBeLessThan(-0.2); // left half
    expect(distance('rejectBox')).toBeLessThan(distance('bigTank')); // front row is nearer
  });

  it('every part has a finite place and size', () => {
    for (const c of machine.components) {
      const f = partFrame(c);
      expect([...f.anchor, ...f.offset, ...f.size].every(Number.isFinite), c.id).toBe(true);
    }
  });
});
