/**
 * The live data the web app holds (plan step 14): the latest reading of every
 * sensor and every state, kept up to date from the live push (step 10): a
 * snapshot on connect, then batches of new readings and state changes.
 */
import type {
  LatestReading,
  LiveReadings,
  LiveSnapshot,
  LiveStates,
  StateSnapshot,
} from '@mixline/shared';

export interface LiveData {
  readings: Readonly<Record<string, LatestReading>>;
  /** Undefined until the first snapshot. */
  states: StateSnapshot | undefined;
}

export const NO_DATA: LiveData = { readings: {}, states: undefined };

/** Everything known at connect time replaces what the app had. */
export function fromSnapshot(snapshot: LiveSnapshot): LiveData {
  return { readings: snapshot.readings, states: snapshot.states };
}

export function withReadings(data: LiveData, batch: LiveReadings): LiveData {
  return { ...data, readings: { ...data.readings, ...batch } };
}

/** Applies only what changed; before the first snapshot there is nothing to apply to. */
export function withStates(data: LiveData, changes: LiveStates): LiveData {
  const s = data.states;
  if (!s) return data;
  return {
    ...data,
    states: {
      line: changes.line ?? s.line,
      sections: { ...s.sections, ...changes.sections },
      subsections: { ...s.subsections, ...changes.subsections },
      components: { ...s.components, ...changes.components },
      sensors: { ...s.sensors, ...changes.sensors },
    },
  };
}

/** How many sensors' latest reading came from the simulator (owner, step 14: the badge counts them). */
export function simulatedCount(readings: LiveData['readings']): number {
  return Object.values(readings).filter((r) => r.source === 'sim').length;
}
