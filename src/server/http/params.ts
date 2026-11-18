import { z } from 'zod';

/**
 * Rack-style request parameters, for the handlers the CakePHP operator panel
 * calls.
 *
 * The panel talks to the internal API exactly as it talked to Rails: PEAR
 * `HTTP_Request2` with `addPostParameter()`, which sends
 * `application/x-www-form-urlencoded`, while `end_time`, `finish_message`,
 * `message` and `message_id` ride in the query string instead. Rails merged
 * query and body into one `params` hash, so its controllers never had to know
 * which side a value came from — and neither must the ported handlers, or an
 * operator's cancellation fee silently becomes 0.
 *
 * Bracket keys expand as Rack expands them: `a[b]=1` nests, `a[]=1&a[]=2`
 * collects, and a repeated plain key keeps the last value. Arrays of hashes
 * (`a[][b]=1`) are not supported; the panel never sends them.
 */

export type Params = Record<string, unknown>;

/**
 * Splits `meeting[calculation_settings][fee]` into its path. A key with an
 * unbalanced bracket is not a path at all, so it is kept whole, as Rack does.
 */
function keyPath(key: string): string[] {
  const start = key.indexOf('[');
  if (start === -1) return [key];

  const path = [key.slice(0, start)];
  let index = start;
  while (index < key.length) {
    if (key[index] !== '[') return [key];
    const close = key.indexOf(']', index);
    if (close === -1) return [key];
    path.push(key.slice(index + 1, close));
    index = close + 1;
  }
  return path;
}

function assign(node: Params, path: string[], value: string): void {
  const [key, ...rest] = path;

  if (rest.length === 0) {
    node[key] = value;
    return;
  }

  // `a[]` — the empty segment collects repeats into a list
  if (rest.length === 1 && rest[0] === '') {
    const current = node[key];
    if (Array.isArray(current)) current.push(value);
    else node[key] = [value];
    return;
  }

  const current = node[key];
  const child: Params =
    current !== null && typeof current === 'object' && !Array.isArray(current)
      ? (current as Params)
      : {};
  node[key] = child;
  assign(child, rest, value);
}

/** Expands flat `key=value` pairs — from a query string or a form body. */
export function expandParams(entries: Iterable<[string, string]>): Params {
  const out: Params = {};
  for (const [key, value] of entries) assign(out, keyPath(key), value);
  return out;
}

/** Body values win over query values, key by key, as Rails' `params` does. */
export function mergeParams(base: Params, overlay: Params): Params {
  const out: Params = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const current = out[key];
    const bothPlainObjects =
      current !== null &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value);
    out[key] = bothPlainObjects
      ? mergeParams(current as Params, value as Params)
      : value;
  }
  return out;
}

/** A nested parameter group — `{}` when the panel left it out entirely. */
export function asParams(value: unknown): Params {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Params) : {};
}

/**
 * The query string and the body as one object.
 *
 * JSON, form-encoded and multipart bodies are all read, because the panel sends
 * form-encoded, our own operator screens send JSON, and a bodyless POST has to
 * keep working. An unparseable body is treated as empty rather than as an
 * error, which is how the Rails stack behaved for these endpoints.
 */
export async function requestParams(request: Request): Promise<Params> {
  const fromQuery = expandParams(new URL(request.url).searchParams);
  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();

  let fromBody: Params = {};

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const entries: Array<[string, string]> = [];
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') entries.push([key, value]);
    }
    fromBody = expandParams(entries);
  } else {
    const text = await request.text();
    if (text.trim()) {
      const asJson = (): Params | null => {
        try {
          return asParams(JSON.parse(text));
        } catch {
          return null;
        }
      };
      const asForm = (): Params => expandParams(new URLSearchParams(text));

      if (contentType.includes('application/json')) fromBody = asJson() ?? {};
      else if (contentType.includes('application/x-www-form-urlencoded')) fromBody = asForm();
      // no content type, or one we do not know: try JSON first, then a form body
      else fromBody = asJson() ?? asForm();
    }
  }

  return mergeParams(fromQuery, fromBody);
}

/**
 * The coercions, which are the other half of Rails' parameter semantics: Ruby
 * never rejected a malformed value from the panel, it converted it. `to_i` turns
 * `"abc"` into 0, `to_time` turns junk into nil and the action falls back, and a
 * checkbox is true only for the two exact strings Rails' cast accepted. A schema
 * that rejects instead would hand the panel a validation error it cannot read —
 * and the panel reports an unreadable body as success.
 */

/** `String#to_i` — leading integer or 0. `"12abc"` → 12, `"abc"` → 0, nil → 0. */
export function railsToInt(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : 0;
  if (typeof value !== 'string') return 0;
  // Ruby allows underscores between digits: "1_000".to_i == 1000
  const match = /^\s*[+-]?\d+(?:_\d+)*/.exec(value);
  if (!match) return 0;
  return Number.parseInt(match[0].replace(/_/g, ''), 10);
}

/**
 * `String#to_time` — nil for a blank value, and, per the old contract, nil
 * rather than an error for one that will not parse. Both cases let the action
 * fall back to the latest attendance timestamp and then to the current time.
 */
export function railsToTime(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' || !value.trim()) return null;
  // `to_time` reads "2026-11-18 20:00:00" in the local zone, as Date does here
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * A checkbox or flag as the panel sends it. Rails' boolean cast treated exactly
 * `'1'` and `'true'` as true; everything else, a JSON `true` included, is false.
 */
export function railsFlag(value: unknown): boolean {
  return value === '1' || value === 'true';
}

/** `Object#presence` — a blank string is nil, anything else is itself. */
export function railsPresence(value: unknown): string | null {
  if (typeof value !== 'string') return value === undefined || value === null ? null : String(value);
  return value.trim() ? value : null;
}

/**
 * `errors.full_messages` — the attribute name humanized and prefixed, which is
 * what rails-i18n's `errors.format` ("%{attribute}%{message}") produces when the
 * attribute itself has no Japanese translation.
 */
export function railsFullMessage(attribute: string, message: string): string {
  const humanized = attribute.replace(/_id$/, '').replace(/_/g, ' ');
  return `${humanized.charAt(0).toUpperCase()}${humanized.slice(1)}${message}`;
}

/**
 * A flag from one of our own JSON screens, where the same field arrives as a
 * real boolean. Deliberately more generous than `railsFlag`, and used only on
 * `/internal_api/messages`, which has no counterpart in the old API.
 */
export const railsBoolean = z
  .union([z.boolean(), z.string()])
  .transform((value) => (typeof value === 'boolean' ? value : value === '1' || value === 'true'));
