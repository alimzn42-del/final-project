/**
 * The scene graph built from the real machine.json (no WebGL needed): every
 * part is there, closed boxes have walls, pending parts are placeholders, and
 * hovering lights up one whole section in the brand's glow colour.
 */
import { type Machine, machineSchema } from '@mixline/shared';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import type { Material, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';

import en from '../../../../config/locales/en.json';
import raw from '../../../../config/machine.json';
import { AppProviders } from '../app/AppProviders';
import { createI18n, switchLanguage } from '../i18n/i18n';
import { fakeApi } from '../test/app';
import { LineContent } from './LineScene';
import { PENDING_OPACITY } from './looks';

const machine: Machine = machineSchema.parse(raw);
const GLOW = '#5fd3ff';

async function renderLine() {
  fakeApi({ 'GET /api/auth/me': { status: 401 } });
  const i18n = await createI18n();
  await switchLanguage(i18n, 'en', () => Promise.resolve(en));
  return ReactThreeTestRenderer.create(
    <AppProviders i18n={i18n}>
      <LineContent machine={machine} glow={GLOW} />
    </AppProviders>,
  );
}

type Renderer = Awaited<ReturnType<typeof renderLine>>;

/** The meshes of one part (its group is named after the part's id). */
function meshesOf(renderer: Renderer, id: string): Mesh[] {
  const group = renderer.scene.findByProps({ name: id });
  return group.findAll((n) => n.type === 'Mesh').map((n) => n.instance as Mesh);
}
const surface = (mesh: Mesh) => mesh.material as Material as MeshStandardMaterial;
/** Glowing: a glow colour that is not black (a material's default glow strength is 1, with black). */
const glows = (mesh: Mesh) =>
  surface(mesh).emissiveIntensity > 0 && surface(mesh).emissive.getHex() !== 0;

describe('the line scene', () => {
  it('has every part of machine.json, named by its id', async () => {
    const renderer = await renderLine();
    for (const c of machine.components) {
      expect(meshesOf(renderer, c.id).length, c.id).toBeGreaterThan(0);
    }
  });

  it('draws closed boxes as six walls (camera box, cabinet)', async () => {
    const renderer = await renderLine();
    for (const id of ['colorBox', 'cabinet']) {
      expect(meshesOf(renderer, id), id).toHaveLength(6);
    }
  });

  it('shows pending parts as see-through placeholders (doc 03)', async () => {
    const renderer = await renderLine();
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
    const renderer = await renderLine();
    const [, liquid] = meshesOf(renderer, 'dyeCTank');
    expect(liquid && `#${surface(liquid).color.getHexString()}`).toBe('#00b7eb');
  });

  it('hovering a part lights up its whole section, in the glow colour; nothing else', async () => {
    const renderer = await renderLine();
    const vessel = renderer.scene.findByProps({ name: 'vessel' });
    await renderer.fireEvent(vessel, 'onPointerOver', { stopPropagation: () => undefined });

    for (const c of machine.components) {
      const lit = meshesOf(renderer, c.id).some(glows);
      expect(lit, c.id).toBe(c.section === 'mixingColor');
    }
    const [vesselMesh] = meshesOf(renderer, 'vessel');
    expect(vesselMesh && `#${surface(vesselMesh).emissive.getHexString()}`).toBe(GLOW);

    await renderer.fireEvent(vessel, 'onPointerOut', { stopPropagation: () => undefined });
    expect(meshesOf(renderer, 'vessel').some(glows)).toBe(false);
  });

  it('the table leads nowhere: it does not react to the pointer', async () => {
    const renderer = await renderLine();
    const table = renderer.scene.findByProps({ name: 'table' });
    expect(table.props.onPointerOver).toBeUndefined();
  });
});
