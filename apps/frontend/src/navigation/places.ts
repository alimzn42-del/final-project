/**
 * The four levels of the line (doc 03 "Navigation"), each its own page with
 * its own address:
 *
 *   /line                                         1 the whole line
 *   /line/:section                                2 one section
 *   /line/:section/:subsection                    3 one sub-section
 *   /line/:section/:subsection/:part              4 one part
 *   /line/:section/part/:part                     4 a part with no sub-section
 *
 * For each page this module says which parts it shows, where clicking each
 * part leads, the breadcrumbs, and which closed boxes are see-through. It is
 * plain data, so every rule is tested without a 3D view.
 */
import type { Machine, MachineComponent } from '@mixline/shared';

type Section = Machine['sections'][number];
type Subsection = Section['subsections'][number];

export type Place =
  | { level: 1 }
  | { level: 2; section: Section }
  | { level: 3; section: Section; subsection: Subsection }
  | { level: 4; section: Section; subsection: Subsection | null; part: MachineComponent };

/** A name to show: an i18n key and, for some parts, its params (each an i18n key too). */
export interface Label {
  labelKey: string;
  labelParams?: Record<string, string> | undefined;
}

/** Where clicking a part leads, and the name shown on hover. */
export interface Target extends Label {
  path: string;
}

/** "part" in the address marks a part with no sub-section (doc 03: a reserved id). */
const PART = 'part';

export function pathOf(place: Place): string {
  switch (place.level) {
    case 1:
      return '/line';
    case 2:
      return `/line/${place.section.id}`;
    case 3:
      return `/line/${place.section.id}/${place.subsection.id}`;
    case 4:
      return `/line/${place.section.id}/${place.subsection?.id ?? PART}/${place.part.id}`;
  }
}

/** The page for an address below /line ("mixingColor/color/camera"); undefined if there is none. */
export function placeFromPath(machine: Machine, rest: string): Place | undefined {
  const [sectionId, second, partId, ...extra] = rest.split('/').filter(Boolean);
  if (extra.length) return undefined;
  if (!sectionId) return { level: 1 };
  const section = machine.sections.find((s) => s.id === sectionId);
  if (!section) return undefined;
  if (!second) return { level: 2, section };

  const subsection = second === PART ? null : section.subsections.find((s) => s.id === second);
  if (subsection === undefined) return undefined;
  if (!partId) return subsection ? { level: 3, section, subsection } : undefined;

  const part = machine.components.find(
    (c) => c.id === partId && c.section === section.id && c.subsection === (subsection?.id ?? null),
  );
  return part ? { level: 4, section, subsection, part } : undefined;
}

export const partPlace = (machine: Machine, part: MachineComponent): Place | undefined => {
  const section = machine.sections.find((s) => s.id === part.section);
  if (!section) return undefined; // the table: scene only
  const subsection = section.subsections.find((s) => s.id === part.subsection) ?? null;
  return { level: 4, section, subsection, part };
};

const labelOf = (place: Place): Label => {
  switch (place.level) {
    case 1:
      return { labelKey: 'page.line' };
    case 2:
      return { labelKey: place.section.labelKey };
    case 3:
      return { labelKey: place.subsection.labelKey };
    case 4:
      return { labelKey: place.part.labelKey, labelParams: place.part.labelParams };
  }
};

/** Line › section › sub-section › part: every level above the page, then the page itself. */
export function breadcrumbs(place: Place): (Label & { path: string })[] {
  const trail: Place[] = [{ level: 1 }];
  if (place.level !== 1) trail.push({ level: 2, section: place.section });
  if (place.level === 3) trail.push(place);
  if (place.level === 4) {
    if (place.subsection)
      trail.push({ level: 3, section: place.section, subsection: place.subsection });
    trail.push(place);
  }
  return trail.map((p) => ({ ...labelOf(p), path: pathOf(p) }));
}

export const pageLabel = labelOf;

export interface PageScene {
  /** Parts the page is about: drawn normally, can be clicked if they have a target. */
  subject: MachineComponent[];
  /** Parts drawn faintly for orientation (the table; a part's box): never clicked. */
  context: MachineComponent[];
  /** Where clicking each subject part leads; no entry = it leads nowhere. */
  targets: Map<string, Target>;
  /** Closed boxes drawn see-through on this page (owner, step 12). */
  seeThrough: Set<string>;
}

/** What the page shows in 3D and where each part leads. */
export function pageScene(machine: Machine, place: Place): PageScene {
  const { components } = machine;
  const table = components.filter((c) => c.section === null);
  const targets = new Map<string, Target>();
  let subject: MachineComponent[];
  let context: MachineComponent[] = table;

  switch (place.level) {
    case 1: {
      // The whole line, table included; a part leads to its section, the table nowhere.
      subject = components;
      context = [];
      for (const c of subject) {
        const section = machine.sections.find((s) => s.id === c.section);
        if (section)
          targets.set(c.id, {
            ...labelOf({ level: 2, section }),
            path: pathOf({ level: 2, section }),
          });
      }
      break;
    }
    case 2: {
      // One section; a part leads to its sub-section, or to its own page if it has none.
      const { section } = place;
      subject = components.filter((c) => c.section === section.id);
      for (const c of subject) {
        const subsection = section.subsections.find((s) => s.id === c.subsection);
        const to: Place = subsection
          ? { level: 3, section, subsection }
          : { level: 4, section, subsection: null, part: c };
        targets.set(c.id, { ...labelOf(to), path: pathOf(to) });
      }
      break;
    }
    case 3: {
      // One sub-section; each part leads to its own page.
      const { section, subsection } = place;
      subject = components.filter(
        (c) => c.section === section.id && c.subsection === subsection.id,
      );
      for (const c of subject) {
        const to: Place = { level: 4, section, subsection, part: c };
        targets.set(c.id, { ...labelOf(to), path: pathOf(to) });
      }
      break;
    }
    case 4: {
      // One part, with the parts grouped under it; its own group's parent is context.
      const { part } = place;
      const inside = components.filter((c) => c.parent === part.id);
      subject = [part, ...inside];
      for (const c of inside) {
        const to = partPlace(machine, c);
        if (to) targets.set(c.id, { ...labelOf(to), path: pathOf(to) });
      }
      const parent = components.find((c) => c.id === part.parent);
      if (parent) context = [...table, parent];
      break;
    }
  }

  // A closed box is see-through when the page offers its inside parts as separate things to
  // open (or the page is about the box or one of its parts): owner, step 12.
  const seeThrough = new Set<string>();
  const shownIds = new Set([...subject, ...context].map((c) => c.id));
  for (const box of components) {
    if (box.geometry.shape !== 'box' || !box.geometry.hollow || !shownIds.has(box.id)) continue;
    const inside = components.filter((c) => c.parent === box.id && shownIds.has(c.id));
    const separate = inside.some((c) => targets.get(c.id)?.path !== targets.get(box.id)?.path);
    const aboutIt = place.level === 4 && (place.part.id === box.id || place.part.parent === box.id);
    if (aboutIt || (inside.length > 0 && separate)) seeThrough.add(box.id);
  }

  return { subject, context, targets, seeThrough };
}

/**
 * The list beside the 3D view: every page this page leads to, once, in the
 * order of doc 03's section tree (sub-sections first, then the parts shown
 * directly on the section page). It also makes every page reachable without
 * the 3D view (keyboard, screen readers).
 */
export function pageLinks(machine: Machine, place: Place): Target[] {
  const { targets, subject } = pageScene(machine, place);
  const links = new Map<string, Target>();
  if (place.level === 1) {
    for (const section of machine.sections) {
      const to: Place = { level: 2, section };
      links.set(pathOf(to), { ...labelOf(to), path: pathOf(to) });
    }
    return [...links.values()];
  }
  if (place.level === 2) {
    for (const subsection of place.section.subsections) {
      const to: Place = { level: 3, section: place.section, subsection };
      links.set(pathOf(to), { ...labelOf(to), path: pathOf(to) });
    }
  }
  for (const c of subject) {
    const target = targets.get(c.id);
    if (target && !links.has(target.path)) links.set(target.path, target);
  }
  return [...links.values()];
}
