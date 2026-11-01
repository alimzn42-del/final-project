/**
 * Rules that compare items of machine.json with each other: unique IDs and
 * MQTT topics, and references that must point to something that exists.
 * Runs on a machine that already passed machineSchema.
 */
import type { Issue } from './issues.js';
import type { Machine, MachineComponent, Sensor } from './machine.schema.js';

/**
 * Subsection ids share the URL level with the word "part"
 * (/line/:section/part/:componentId), so no subsection may be called "part".
 */
export const RESERVED_SUBSECTION_IDS = ['part'] as const;

export function checkMachineRules(machine: Machine): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  const components = new Map<string, MachineComponent>();
  const sensors = new Map<string, { sensor: Sensor; componentId: string }>();
  const topics = new Map<string, string>();

  // --- sections ---
  const sectionIds = new Set<string>();
  for (const section of machine.sections) {
    if (sectionIds.has(section.id)) add(`sections[${section.id}]`, 'duplicate section id');
    sectionIds.add(section.id);
    const subIds = new Set<string>();
    for (const sub of section.subsections) {
      const path = `sections[${section.id}].subsections[${sub.id}]`;
      if (subIds.has(sub.id)) add(path, 'duplicate subsection id in this section');
      if ((RESERVED_SUBSECTION_IDS as readonly string[]).includes(sub.id)) {
        add(path, `"${sub.id}" is reserved for component URLs`);
      }
      subIds.add(sub.id);
    }
  }

  // --- components and sensors: unique ids, unique topics ---
  for (const c of machine.components) {
    if (components.has(c.id)) add(`components[${c.id}]`, 'duplicate component id');
    components.set(c.id, c);
    for (const s of c.sensors) {
      const path = `components[${c.id}].sensors[${s.id}]`;
      const sameId = sensors.get(s.id);
      if (sameId) add(path, `duplicate sensor id (also on ${sameId.componentId})`);
      sensors.set(s.id, { sensor: s, componentId: c.id });

      // (station, variable) must be unique so every MQTT topic maps to one sensor.
      const topic = `${s.station}/sensors/${s.variable}`;
      const owner = topics.get(topic);
      if (owner) add(path, `MQTT topic …/${topic} is already used by sensor ${owner}`);
      topics.set(topic, s.id);
    }
  }

  // --- references ---
  for (const c of machine.components) {
    const path = `components[${c.id}]`;

    if (c.section !== null) {
      const section = machine.sections.find((s) => s.id === c.section);
      if (!section) {
        add(`${path}.section`, `unknown section "${c.section}"`);
      } else if (c.subsection !== null && !section.subsections.some((s) => s.id === c.subsection)) {
        add(`${path}.subsection`, `section "${c.section}" has no subsection "${c.subsection}"`);
      }
    }

    if (c.parent !== undefined) {
      const parent = components.get(c.parent);
      if (!parent) {
        add(`${path}.parent`, `unknown component "${c.parent}"`);
      } else if (parent.section !== c.section || parent.subsection !== c.subsection) {
        // Parents only group parts on a component list, so both must be on the same page.
        add(`${path}.parent`, `parent "${c.parent}" is in a different section or subsection`);
      }
      if (hasParentCycle(c, components)) add(`${path}.parent`, 'parent chain loops back');
    }

    const level = c.geometry.shape === 'cylinder' ? c.geometry.liquid?.levelSource : undefined;
    if (level) {
      const ref = sensors.get(level.sensor);
      if (!ref)
        add(`${path}.geometry.liquid.levelSource.sensor`, `unknown sensor "${level.sensor}"`);
      else if (ref.sensor.kind !== 'analog') {
        add(`${path}.geometry.liquid.levelSource.sensor`, `sensor "${level.sensor}" is not analog`);
      }
    }
  }

  machine.liquids.mix.source.forEach((sensorId, i) => {
    const ref = sensors.get(sensorId);
    if (!ref) add(`liquids.mix.source[${String(i)}]`, `unknown sensor "${sensorId}"`);
    else if (ref.sensor.kind !== 'analog') {
      add(`liquids.mix.source[${String(i)}]`, `sensor "${sensorId}" is not analog`);
    }
  });

  const stationIds = new Set<string>();
  for (const station of machine.conveyor.stations) {
    if (stationIds.has(station.id)) add(`conveyor.stations[${station.id}]`, 'duplicate station id');
    stationIds.add(station.id);
  }

  return issues;
}

function hasParentCycle(start: MachineComponent, all: Map<string, MachineComponent>): boolean {
  const seen = new Set<string>([start.id]);
  let current = start.parent === undefined ? undefined : all.get(start.parent);
  while (current) {
    if (seen.has(current.id)) return true;
    seen.add(current.id);
    current = current.parent === undefined ? undefined : all.get(current.parent);
  }
  return false;
}
