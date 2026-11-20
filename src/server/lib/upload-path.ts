import { extname, join, sep } from 'node:path';
import { env } from '@/server/config/env';

/**
 * Resolves a request path under the upload mount to a file on disk.
 *
 * It lives apart from the route handler because a Next route file may only
 * export the method handlers and a few config fields, and the containment
 * check below is exactly the thing worth having tests for.
 */

/**
 * `cache` and `store` are the two Shrine storages. `uploads/cast_pictures` is
 * their sibling on disk and holds identity documents, so it must stay
 * unreachable here — it is served, authenticated, by
 * /api/admin/access_requests/[userId]/picture.
 */
export const UPLOAD_STORAGES = new Set(['cache', 'store']);

export const UPLOAD_CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export interface UploadTarget {
  path: string;
  contentType: string;
  storage: string;
}

/**
 * The segments are attacker-controlled, so the *resolved* path is checked to be
 * inside the storage directory. `join` normalises `..` away first, and a
 * containment test cannot be talked around the way a blocklist of `..` and its
 * encodings can.
 */
export function resolveUploadPath(segments: string[]): UploadTarget | null {
  const [storage, ...rest] = segments;
  if (!storage || !UPLOAD_STORAGES.has(storage) || rest.length === 0) return null;
  if (segments.some((segment) => segment.includes('\0'))) return null;

  const contentType = UPLOAD_CONTENT_TYPES[extname(rest[rest.length - 1]).toLowerCase()];
  if (!contentType) return null;

  const root = join(env.uploadsDir, storage);
  const path = join(root, ...rest);
  if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) return null;

  return { path, contentType, storage };
}
