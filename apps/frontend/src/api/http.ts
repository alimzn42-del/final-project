/**
 * Calls to the backend. The API is at /api on the same address as the page
 * (nginx, or the Vite proxy in development), so the session cookie goes along
 * by itself and no address is configured in the app.
 */

/** A failed call: the HTTP status, or 0 when the server could not be reached. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(status ? `the API answered ${String(status)}` : 'the server could not be reached');
  }
}

export async function api<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, undefined);
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

/** The fields named in a 400 answer ({ issues: [{ path, message }] }). */
export function invalidFields(error: unknown): string[] {
  if (!(error instanceof ApiError) || error.status !== 400) return [];
  const issues = (error.body as { issues?: unknown } | undefined)?.issues;
  if (!Array.isArray(issues)) return [];
  return issues.flatMap((i: unknown) => {
    const path = (i as { path?: unknown }).path;
    return typeof path === 'string' ? [path] : [];
  });
}
