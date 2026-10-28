/**
 * Live states of the line (docs/04-architecture.md "State from limits"),
 * plan step 10.
 *
 * - Recomputed every second from the latest values in memory: offline depends
 *   on time alone, so new messages are not enough to notice it.
 * - The last snapshot is kept: GET /api/state and new live clients get it, and
 *   listeners get only what changed since it, so a client that starts from it
 *   and applies every change is always exact.
 */
import {
  type Machine,
  machineStates,
  type StateChanges,
  stateChanges,
  type StateSnapshot,
  toStateSnapshot,
} from '@mixline/shared';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { MACHINE } from '../machine/machine.tokens.js';
import { TelemetryIngest } from '../telemetry/ingest.js';

/** How often the states are recomputed. */
export const STATE_EVERY_MS = 1000;

export type StateListener = (changes: StateChanges) => void;

@Injectable()
export class StateService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('State');
  private readonly listeners = new Set<StateListener>();
  private snapshot: StateSnapshot;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(MACHINE) private readonly machine: Machine,
    @Inject(TelemetryIngest) private readonly ingest: TelemetryIngest,
  ) {
    this.snapshot = this.compute(Date.now());
  }

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.update();
    }, STATE_EVERY_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** The states as of the last update (at most 1 s old). */
  current(): StateSnapshot {
    return this.snapshot;
  }

  /** Calls `listener` with every change; returns a function that stops it. */
  onChange(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Recomputes the states and tells the listeners what changed, if anything. */
  update(now: number = Date.now()): StateChanges | undefined {
    const next = this.compute(now);
    const changes = stateChanges(this.snapshot, next);
    this.snapshot = next;
    if (changes) {
      for (const listener of this.listeners) {
        // One broken listener must not stop the others, nor the timer.
        try {
          listener(changes);
        } catch (error) {
          this.logger.warn(`state listener failed: ${String(error)}`);
        }
      }
    }
    return changes;
  }

  private compute(now: number): StateSnapshot {
    return toStateSnapshot(machineStates(this.machine, this.ingest.latestValues(), now));
  }
}
