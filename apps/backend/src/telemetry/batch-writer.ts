/**
 * Collects readings and writes them in batches: one database statement every
 * half second instead of one per reading. If the database is down, readings
 * wait in memory (up to a limit) and are written when it is back; only past
 * that limit are the oldest dropped, with a warning.
 */
import type { TelemetryRow, TelemetryStore } from './telemetry-store.js';

export interface BatchWriterOptions {
  /** How often buffered readings are written. */
  intervalMs: number;
  /** Write at once when this many readings are waiting. */
  maxBatch: number;
  /** Readings kept in memory while the database is down (~5 minutes now). */
  maxBuffered: number;
}

export const DEFAULT_BATCH_OPTIONS: BatchWriterOptions = {
  intervalMs: 500,
  maxBatch: 1000,
  maxBuffered: 20_000,
};

export interface WriterLog {
  warn(message: string): void;
  log(message: string): void;
}

export class BatchWriter {
  private buffer: TelemetryRow[] = [];
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private failing = false;
  private dropped = 0;

  constructor(
    private readonly store: TelemetryStore,
    private readonly log: WriterLog,
    private readonly options: BatchWriterOptions = DEFAULT_BATCH_OPTIONS,
  ) {}

  start(): void {
    this.timer ??= setInterval(() => void this.flush(), this.options.intervalMs);
  }

  /** Writes what is left, then stops the timer. */
  async stop(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    await this.flush();
  }

  add(row: TelemetryRow): void {
    this.buffer.push(row);
    this.trim();
    if (this.buffer.length >= this.options.maxBatch) void this.flush();
  }

  /** Readings waiting to be written (tests and monitoring). */
  get pending(): number {
    return this.buffer.length;
  }

  /** Writes the waiting readings. Never throws: a failure keeps them for the next try. */
  flush(): Promise<void> {
    if (this.running) return this.running;
    if (this.buffer.length === 0) return Promise.resolve();
    const rows = this.buffer;
    this.buffer = [];
    this.running = this.store
      .insert(rows)
      .then(
        () => {
          if (this.failing) {
            this.failing = false;
            this.log.log('telemetry writes resumed');
          }
        },
        (error: unknown) => {
          // Put them back in front of anything that arrived meanwhile.
          this.buffer = [...rows, ...this.buffer];
          this.trim();
          if (!this.failing) {
            this.failing = true;
            const reason = error instanceof Error ? error.message : String(error);
            this.log.warn(
              `cannot write telemetry (${reason}); keeping up to ${String(this.options.maxBuffered)} readings in memory`,
            );
          }
        },
      )
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }

  private trim(): void {
    const extra = this.buffer.length - this.options.maxBuffered;
    if (extra <= 0) return;
    this.buffer.splice(0, extra);
    this.dropped += extra;
    this.log.warn(
      `telemetry buffer full: dropped the ${String(this.dropped)} oldest readings so far`,
    );
  }
}
