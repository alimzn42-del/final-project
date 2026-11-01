/**
 * Plan step 13's check, on the real machine.json: every section, sub-section
 * and part is reachable by its address and by clicking from /line; plus the
 * breadcrumbs, the targets per level and the see-through rule (owner, step 12).
 */
import { type Machine, machineSchema } from '@mixline/shared';
import { describe, expect, it } from 'vitest';

import raw from '../../../../config/machine.json';
import {
  breadcrumbs,
  pageLinks,
  pageScene,
  partPlace,
  pathOf,
  type Place,
  placeFromPath,
} from './places';

const machine: Machine = machineSchema.parse(raw);
const at = (path: string): Place => {
  const place = placeFromPath(machine, path.replace(/^\/line\/?/, ''));
  if (!place) throw new Error(`no page at ${path}`);
  return place;
};

/** Every page reachable from /line by following clicks (3D or the side list). */
function reachableByClicks(): Set<string> {
  const seen = new Set<string>(['/line']);
  const queue = ['/line'];
  while (queue.length) {
    const path = queue.shift() ?? '';
    for (const target of pageScene(machine, at(path)).targets.values()) {
      if (!seen.has(target.path)) {
        seen.add(target.path);
        queue.push(target.path);
      }
    }
    for (const link of pageLinks(machine, at(path))) {
      if (!seen.has(link.path)) {
        seen.add(link.path);
        queue.push(link.path);
      }
    }
  }
  return seen;
}

/** The address of every section, sub-section and part (the table has none: scene only). */
function everyPage(): string[] {
  const paths = ['/line'];
  for (const section of machine.sections) {
    paths.push(pathOf({ level: 2, section }));
    for (const subsection of section.subsections) {
      paths.push(pathOf({ level: 3, section, subsection }));
    }
  }
  for (const part of machine.components) {
    const place = partPlace(machine, part);
    if (place) paths.push(pathOf(place));
  }
  return paths;
}

describe('every page of the line (plan step 13)', () => {
  it('has an address that leads back to it', () => {
    const pages = everyPage();
    const subsections = machine.sections.flatMap((s) => s.subsections).length;
    // The line, every section and sub-section, and every part but the table (scene only).
    expect(pages).toHaveLength(
      1 + machine.sections.length + subsections + machine.components.length - 1,
    );
    for (const path of pages) expect(pathOf(at(path))).toBe(path);
  });

  it('is reachable by clicking from /line', () => {
    const reachable = reachableByClicks();
    for (const path of everyPage()) expect(reachable.has(path), path).toBe(true);
  });

  it('unknown addresses are no page', () => {
    for (const rest of [
      'nowhere',
      'mixingColor/nowhere',
      'mixingColor/color/nowhere',
      'mixingColor/mixing/camera', // the camera is in "color", not "mixing"
      'conveyor/part/camera', // not in this section
      'cabinet/part', // "part" needs a part
      'mixingColor/color/camera/extra',
    ]) {
      expect(placeFromPath(machine, rest), rest).toBeUndefined();
    }
  });
});

describe('where a click leads, per level (doc 03)', () => {
  const target = (path: string, id: string) => pageScene(machine, at(path)).targets.get(id)?.path;

  it('line: a part leads to its section; the table leads nowhere', () => {
    expect(target('/line', 'camera')).toBe('/line/mixingColor');
    expect(target('/line', 'rollerDrive')).toBe('/line/conveyor');
    expect(target('/line', 'table')).toBeUndefined();
  });

  it('section: to its sub-section, or to the part itself when it has none', () => {
    expect(target('/line/mixingColor', 'camera')).toBe('/line/mixingColor/color');
    expect(target('/line/conveyor', 'rollerDrive')).toBe('/line/conveyor/part/rollerDrive');
    // A section without sub-sections: level 3 is skipped (doc 03).
    expect(target('/line/cabinet', 'plc')).toBe('/line/cabinet/part/plc');
  });

  it('sub-section: to each part', () => {
    expect(target('/line/mixingColor/color', 'camera')).toBe('/line/mixingColor/color/camera');
  });

  it('part: shows the parts grouped under it, which lead to their own pages', () => {
    const scene = pageScene(machine, at('/line/mixingColor/color/colorBox'));
    expect(scene.subject.map((c) => c.id)).toEqual(
      expect.arrayContaining(['colorBox', 'camera', 'sampleCell', 'ledPanel']),
    );
    expect(scene.targets.get('camera')?.path).toBe('/line/mixingColor/color/camera');
    expect(scene.targets.has('colorBox')).toBe(false); // the page's own part
  });

  it('a part inside a box shows the box as context, never as something to click', () => {
    const scene = pageScene(machine, at('/line/mixingColor/color/camera'));
    expect(scene.subject.map((c) => c.id)).toEqual(['camera']);
    expect(scene.context.map((c) => c.id)).toContain('colorBox');
    expect(scene.targets.size).toBe(0);
  });
});

describe('closed boxes are see-through when their inside is on the page (owner, step 12)', () => {
  const clear = (path: string, id: string) => pageScene(machine, at(path)).seeThrough.has(id);

  it('the camera box: opaque on the line and its section, see-through from its sub-section down', () => {
    expect(clear('/line', 'colorBox')).toBe(false);
    expect(clear('/line/mixingColor', 'colorBox')).toBe(false);
    expect(clear('/line/mixingColor/color', 'colorBox')).toBe(true);
    expect(clear('/line/mixingColor/color/colorBox', 'colorBox')).toBe(true);
    expect(clear('/line/mixingColor/color/camera', 'colorBox')).toBe(true);
  });

  it('the cabinet: opaque on the line, see-through on its section page (no sub-sections)', () => {
    expect(clear('/line', 'cabinet')).toBe(false);
    expect(clear('/line/cabinet', 'cabinet')).toBe(true);
    expect(clear('/line/cabinet/part/plc', 'cabinet')).toBe(true);
  });
});

describe('breadcrumbs', () => {
  it('Line › section › sub-section › part, each with its address', () => {
    expect(breadcrumbs(at('/line/mixingColor/color/camera'))).toEqual([
      { labelKey: 'page.line', path: '/line' },
      { labelKey: 'section.mixingColor', path: '/line/mixingColor' },
      { labelKey: 'section.color', path: '/line/mixingColor/color' },
      { labelKey: 'part.camera', labelParams: undefined, path: '/line/mixingColor/color/camera' },
    ]);
  });

  it('a part with no sub-section skips that level', () => {
    expect(breadcrumbs(at('/line/cabinet/part/plc')).map((c) => c.path)).toEqual([
      '/line',
      '/line/cabinet',
      '/line/cabinet/part/plc',
    ]);
  });
});

describe('the list beside the 3D view', () => {
  it('line: the sections, in order', () => {
    expect(pageLinks(machine, at('/line')).map((l) => l.path)).toEqual(
      machine.sections.map((s) => `/line/${s.id}`),
    );
  });

  it('section: its sub-sections first, then the parts shown directly, each once', () => {
    const links = pageLinks(machine, at('/line/conveyor')).map((l) => l.path);
    expect(links.slice(0, 4)).toEqual([
      '/line/conveyor/feeder',
      '/line/conveyor/filling',
      '/line/conveyor/checkCap',
      '/line/conveyor/tray',
    ]);
    expect(links).toContain('/line/conveyor/part/rollerDrive');
    expect(new Set(links).size).toBe(links.length);
  });
});
