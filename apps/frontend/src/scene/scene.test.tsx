/**
 * The scene graph built from the real machine.json (no WebGL needed): every
 * part is there, closed boxes have walls, pending parts are placeholders,
 * hovering lights up what a click would open, and clicks navigate (step 13).
 */
import { type Machine, machineSchema } from '@mixline/shared';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import type { Material, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';

import en from '../../../../config/locales/en.json';
import raw from '../../../../config/machine.json';
import { AppProviders } from '../app/AppProviders';
import { createI18n, switchLanguage } from '../i18n/i18n';
import { pageScene, placeFromPath } from '../navigation/places';
import { fakeApi } from '../test/app';
import { SceneContent } from './LineScene';
import { GHOST_OPACITY, PENDING_OPACITY, SEE_THROUGH_OPACITY } from './looks';

const machine: Machine = machineSchema.parse(raw);
const GLOW = '#5fd3ff';

async function renderScene(path = '') {
  fakeApi({ 'GET /api/auth/me': { status: 401 } });
  const i18n = await createI18n();
  await switchLanguage(i18n, 'en', () => Promise.resolve(en));
  const place = placeFromPath(machine, path);
  if (!place) throw new Error(`no page ${path}`);
  const onNavigate = vi.fn<(path: string) => void>();
  const renderer = await ReactThreeTestRenderer.create(
    <AppProviders i18n={i18n}>
      <SceneContent
        machine={machine}
        page={pageScene(machine, place)}
        allTags={place.level > 1}
        glow={GLOW}
        onNavigate={onNavigate}
      />
    </AppProviders>,
  );
  return { renderer, onNavigate };
}

type Renderer = Awaited<ReturnType<typeof renderScene>>['renderer'];

/** The meshes of one part (its group is named after the part's id). */
function meshesOf(renderer: Renderer, id: string): Mesh[] {
  const group = renderer.scene.findByProps({ name: id });
  return group.findAll((n) => n.type === 'Mesh').map((n) => n.instance as Mesh);
}
const surface = (mesh: Mesh) => mesh.material as Material as MeshStandardMaterial;
/** Glowing: a glow colour that is not black (a material's default glow strength is 1, with black). */
const glows = (mesh: Mesh) =>
  surface(mesh).emissiveIntensity > 0 && surface(mesh).emissive.getHex() !== 0;

/** A pointer event as React Three Fiber passes it; mouse by default. */
const pointer = (over: { delta?: number; touch?: boolean; behind?: Mesh[] } = {}) => ({
  stopPropagation: () => undefined,
  delta: over.delta ?? 0,
  intersections: (over.behind ?? []).map((object) => ({ object })),
  nativeEvent: { pointerType: over.touch ? 'touch' : 'mouse' },
});

describe('the line page in 3D', () => {
  it('has every part of machine.json, named by its id', async () => {
    const { renderer } = await renderScene();
    for (const c of machine.components) {
      expect(meshesOf(renderer, c.id).length, c.id).toBeGreaterThan(0);
    }
  });

  it('draws closed boxes as six walls (camera box, cabinet), opaque on the overview', async () => {
    const { renderer } = await renderScene();
    for (const id of ['colorBox', 'cabinet']) {
      const walls = meshesOf(renderer, id);
      expect(walls, id).toHaveLength(6);
      expect(
        walls.every((w) => surface(w).opacity === 1),
        id,
      ).toBe(true);
    }
  });

  it('shows pending parts as see-through placeholders (doc 03)', async () => {
    const { renderer } = await renderScene();
    const pending = machine.components.filter((c) => c.status === 'pending');
    expect(pending.length).toBeGreaterThan(0);
    for (const c of pending) {
      const outer = meshesOf(renderer, c.id)[0];
      if (!outer) throw new Error(c.id);
      expect(surface(outer).opacity, c.id).toBeLessThanOrEqual(PENDING_OPACITY);
      expect(surface(outer).transparent, c.id).toBe(true);
    }
  });

  it('a tank shows its liquid, in the liquid colour from machine.json', async () => {
    const { renderer } = await renderScene();
    const [, liquid] = meshesOf(renderer, 'dyeCTank');
    expect(liquid && `#${surface(liquid).color.getHexString()}`).toBe('#00b7eb');
  });

  it('hovering a part lights up its whole section, in the glow colour; nothing else', async () => {
    const { renderer } = await renderScene();
    const vessel = renderer.scene.findByProps({ name: 'vessel' });
    await renderer.fireEvent(vessel, 'onPointerOver', pointer());

    for (const c of machine.components) {
      const lit = meshesOf(renderer, c.id).some(glows);
      expect(lit, c.id).toBe(c.section === 'mixingColor');
    }
    const [vesselMesh] = meshesOf(renderer, 'vessel');
    expect(vesselMesh && `#${surface(vesselMesh).emissive.getHexString()}`).toBe(GLOW);

    await renderer.fireEvent(vessel, 'onPointerOut', pointer());
    expect(meshesOf(renderer, 'vessel').some(glows)).toBe(false);
  });

  it('the table leads nowhere: it does not react to the pointer', async () => {
    const { renderer } = await renderScene();
    const table = renderer.scene.findByProps({ name: 'table' });
    expect(table.props.onPointerOver).toBeUndefined();
    expect(table.props.onClick).toBeUndefined();
  });
});

describe('clicking in 3D (plan step 13)', () => {
  it('a click opens the page the part leads to', async () => {
    const { renderer, onNavigate } = await renderScene();
    await renderer.fireEvent(renderer.scene.findByProps({ name: 'vessel' }), 'onClick', pointer());
    expect(onNavigate).toHaveBeenCalledWith('/line/mixingColor');
  });

  it('a drag that turns the view is not a click', async () => {
    const { renderer, onNavigate } = await renderScene();
    const vessel = renderer.scene.findByProps({ name: 'vessel' });
    await renderer.fireEvent(vessel, 'onClick', pointer({ delta: 40 }));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('touch: the first tap lights the part and shows its name, the second opens it', async () => {
    const { renderer, onNavigate } = await renderScene();
    const vessel = renderer.scene.findByProps({ name: 'vessel' });
    await renderer.fireEvent(vessel, 'onClick', pointer({ touch: true }));
    expect(onNavigate).not.toHaveBeenCalled();
    expect(meshesOf(renderer, 'vessel').some(glows)).toBe(true);
    await renderer.fireEvent(vessel, 'onClick', pointer({ touch: true }));
    expect(onNavigate).toHaveBeenCalledWith('/line/mixingColor');
  });

  it('a section page leads on to sub-sections; the table is only a faint context', async () => {
    const { renderer, onNavigate } = await renderScene('mixingColor');
    await renderer.fireEvent(renderer.scene.findByProps({ name: 'camera' }), 'onClick', pointer());
    expect(onNavigate).toHaveBeenCalledWith('/line/mixingColor/color');
    const table = renderer.scene.findByProps({ name: 'table' });
    expect(table.props.onClick).toBeUndefined();
    expect(meshesOf(renderer, 'table').every((m) => surface(m).opacity <= GHOST_OPACITY)).toBe(
      true,
    );
    // Other sections are not drawn on a section page.
    expect(() => renderer.scene.findByProps({ name: 'conveyorMotor' })).toThrow();
  });

  it('see-through box: a click on a part inside goes through the box wall to that part', async () => {
    const { renderer, onNavigate } = await renderScene('mixingColor/color');
    const walls = meshesOf(renderer, 'colorBox');
    expect(walls.every((w) => surface(w).opacity <= SEE_THROUGH_OPACITY)).toBe(true);

    const box = renderer.scene.findByProps({ name: 'colorBox' });
    const [camera] = meshesOf(renderer, 'camera');
    const [wall] = walls;
    if (!camera || !wall) throw new Error('no camera or wall mesh');
    await renderer.fireEvent(box, 'onClick', pointer({ behind: [wall, camera] }));
    expect(onNavigate).not.toHaveBeenCalled(); // the box let it through to the camera

    await renderer.fireEvent(box, 'onClick', pointer({ behind: [wall] }));
    expect(onNavigate).toHaveBeenCalledWith('/line/mixingColor/color/colorBox');
  });

  it("a part's page shows the box around it as a faint context that does not react", async () => {
    const { renderer } = await renderScene('mixingColor/color/camera');
    const box = renderer.scene.findByProps({ name: 'colorBox' });
    expect(box.props.onClick).toBeUndefined();
    expect(meshesOf(renderer, 'colorBox').every((m) => surface(m).opacity <= GHOST_OPACITY)).toBe(
      true,
    );
  });
});
