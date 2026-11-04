/**
 * Where the reader points on a chart, as a time (plan step 14): the mouse, a
 * finger (press and drag), or the arrow keys on the focused chart (Home and
 * End jump to the edges, Escape lets go). Undefined while nobody points.
 */
import { type KeyboardEvent, type PointerEvent, useState } from 'react';

/** Arrow keys move by this share of the window. */
const KEY_STEPS = 60;

export function useHoverTime(from: number, to: number) {
  const [at, setAt] = useState<number | undefined>();

  const fromPointer = (e: PointerEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width <= 0) return;
    const share = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    setAt(from + share * (to - from));
  };
  const clear = () => {
    setAt(undefined);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') {
      clear();
      return;
    }
    const step = (to - from) / KEY_STEPS;
    // The first arrow press starts at the latest value.
    const current = at ?? to + (e.key === 'ArrowLeft' ? step : -step);
    const moves: Record<string, number> = {
      ArrowLeft: current - step,
      ArrowRight: current + step,
      Home: from,
      End: to,
    };
    const next = moves[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setAt(Math.min(to, Math.max(from, next)));
  };

  const inside = at !== undefined && at >= from && at <= to ? at : undefined;
  return {
    at: inside,
    handlers: {
      onPointerMove: fromPointer,
      onPointerDown: fromPointer,
      onPointerLeave: clear,
      onBlur: clear,
      onKeyDown,
    },
  };
}
