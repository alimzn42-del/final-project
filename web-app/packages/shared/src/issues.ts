/**
 * A validation problem found in machine.json or the locale files, with a
 * path a person can follow in the file, e.g.
 * `components[samplePump].sensors[samplePump.dir].valueLabels`.
 */
import type { z } from 'zod';

export interface Issue {
  path: string;
  message: string;
}

/**
 * Writes a path with IDs instead of array indexes where the item has an `id`,
 * by walking `data` along the path.
 */
export function pathToString(path: readonly PropertyKey[], data: unknown): string {
  let out = '';
  let node: unknown = data;
  for (const segment of path) {
    const next: unknown =
      isRecord(node) || Array.isArray(node) ? Reflect.get(node, segment) : undefined;
    if (typeof segment === 'number') {
      const itemId = isRecord(next) && typeof next.id === 'string' ? next.id : undefined;
      out += `[${itemId ?? String(segment)}]`;
    } else {
      out += out ? `.${String(segment)}` : String(segment);
    }
    node = next;
  }
  return out || '(root)';
}

export function zodIssues(error: z.ZodError, data: unknown): Issue[] {
  return error.issues.map((i) => ({ path: pathToString(i.path, data), message: i.message }));
}

export function formatIssues(issues: readonly Issue[]): string {
  return issues.map((i) => `- ${i.path}: ${i.message}`).join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
