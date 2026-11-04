/**
 * Step-by-step programs, written like a PLC sequence (plan step 15). A program is a generator:
 * each `yield` waits one tick (the plant moves on by one time step in between), so the batch
 * reads top to bottom: "run the base pump, wait until it stops, mix 5 s, take a sample".
 */

/** A program that waits with `yield` and may finish with a result. */
export type Program<T = void> = Generator<undefined, T, undefined>;

/** Anything that knows the time in seconds (the plant). */
export interface Clock {
  readonly timeS: number;
}

export function* waitS(clock: Clock, seconds: number): Program {
  const end = clock.timeS + seconds;
  while (clock.timeS < end - 1e-9) yield;
}

export function* waitUntil(done: () => boolean): Program {
  while (!done()) yield;
}

/** Runs programs side by side (the conveyor stations work at the same time). */
export function* together(...programs: Program[]): Program {
  let live = programs;
  for (;;) {
    live = live.filter((p) => p.next().done !== true);
    if (live.length === 0) return;
    yield;
  }
}
