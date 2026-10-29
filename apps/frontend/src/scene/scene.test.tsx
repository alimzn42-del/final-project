/**
 * The scene graph built from the real machine.json (no WebGL needed): every
 * part is there, closed boxes have walls, pending parts are placeholders,
 * hovering lights up what a click would open, and clicks navigate (step 13).
 */
import { type Machine, machineSchema, type State, type StateSnapshot } from '@mixline/shared';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import type { Color, Material, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';

import en from '../../../../config/locales/en.json';
import raw from '../../../../config/machine.json';
import { AppProviders } from '../app/AppProviders';
import { createI18n, switchLanguage } from '../i18n/i18n';
import { pageScene, placeFromPath } from '../navigation/places';
import { fakeApi } from '../test/app';
import { SceneContent } from './LineScene';
import {
  DEFAULT_STATE_COLORS,
  GHOST_OPACITY,
  PENDING_OPACITY,
  pulseBoost,
  SEE_THROUGH_OPACITY,
} from './looks';

const machine: Machine = machineSchema.parse(raw);
const GLOW = '#5fd3ff';

async function renderScene(path = '', states?: StateSnapshot) {
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
        states={states}
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

/** Every part's state 'ok', except the given ones. */
function statesWith(parts: Record<string, State>): StateSnapshot {
  const components = Object.fromEntries(
    machine.components.map((c) => [c.id, c.sensors.length ? 'ok' : 'none']),
  ) as Record<string, State>;
  return {
    line: 'ok',
    sections: {},
    subsections: {},
    sensors: {},
    components: { ...components, ...parts },
  };
}

const hex = (color: { getHexString: () => string }) => `#${color.getHexString()}`;

/** The colours of a part's edge lines (drei Edges draws them as line segments). */
function edgeColours(renderer: Renderer, id: string): string[] {
  const group = renderer.scene.findByProps({ name: id });
  // drei 10 draws Edges as three-stdlib's LineSegments2 (thick lines) with a LineMaterial.
  return group
    .findAll((n) => (n.instance as { isLineSegments2?: boolean }).isLineSegments2 === true)
    .map((n) => hex((n.instance as unknown as { material: { color: Color } }).material.color));
}
const C = DEFAULT_STATE_COLORS;
const emissiveOf = (mesh: Mesh | undefined) => mesh && hex(surface(mesh).emissive);

describe('state colours in 3D (doc 03, plan step 14)', () => {
  it('fault and warning glow and are outlined in their own colour, never the brand blue', async () => {
    const { renderer } = await renderScene('', statesWith({ vessel: 'fault', cabinet: 'warning' }));
    const [vessel] = meshesOf(renderer, 'vessel');
    expect(emissiveOf(vessel)).toBe(C.fault);
    expect(edgeColours(renderer, 'vessel')).toEqual([C.fault]);
    expect(new Set(edgeColours(renderer, 'cabinet'))).toEqual(new Set([C.warning]));
    expect(edgeColours(renderer, 'conveyorMotor')).toEqual([]); // ok: normal look
  });

  it('a fault stays visible under the pointer; the rest of the section lights up blue', async () => {
    const { renderer } = await renderScene('', statesWith({ vessel: 'fault' }));
    await renderer.fireEvent(
      renderer.scene.findByProps({ name: 'pedestal' }),
      'onPointerOver',
      pointer(),
    );
    expect(emissiveOf(meshesOf(renderer, 'vessel')[0])).toBe(C.fault);
    expect(edgeColours(renderer, 'vessel')).toEqual([C.fault]);
    expect(emissiveOf(meshesOf(renderer, 'pedestal')[0])).toBe(GLOW);
  });

  it('offline is grey and dimmed, and so is the liquid in a tank', async () => {
    const { renderer } = await renderScene('', statesWith({ dyeCTank: 'offline', dyeMTank: 'ok' }));
    const [cTank, cLiquid] = meshesOf(renderer, 'dyeCTank');
    const [, mLiquid] = meshesOf(renderer, 'dyeMTank');
    expect(cTank && hex(surface(cTank).color)).toBe(C.offline);
    expect(cLiquid && mLiquid && surface(cLiquid).opacity).toBeLessThan(
      mLiquid ? surface(mLiquid).opacity : 0,
    );
  });

  it('a pending part in fault stays a see-through placeholder and gets the fault outline', async () => {
    const tank = machine.components.find((c) => c.id === 'dyeCTank');
    expect(tank?.status).toBe('pending');
    const { renderer } = await renderScene('', statesWith({ dyeCTank: 'fault' }));
    const [outer] = meshesOf(renderer, 'dyeCTank');
    expect(outer && surface(outer).opacity).toBeLessThanOrEqual(PENDING_OPACITY);
    expect(edgeColours(renderer, 'dyeCTank')).toEqual([C.fault]);
  });

  it('a state change pulses once: brighter, then back (none at the start or the end)', () => {
    expect(pulseBoost(0)).toBe(0);
    expect(pulseBoost(0.5)).toBeGreaterThan(0.5);
    expect(pulseBoost(1)).toBe(0);
    expect(pulseBoost(1.5)).toBe(0);
  });
});
