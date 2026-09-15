import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomBytes } from 'node:crypto';
import type { Readable } from 'node:stream';
import { env } from '@/server/config/env';
import { logger } from '@/server/lib/logger';
import { AppError } from '@/server/lib/errors';

/**
 * Replacement for the three Shrine uploaders (UserPicturesUploader,
 * PostPicturesUploader, PictureMessageUploader).
 *
 * Shrine's `*_data` columns hold JSON of the form
 *   {"id": "ab/cdef.jpg", "storage": "store", "metadata": {...}}
 * and the public url is the storage prefix plus the id. That shape is kept so
 * rows written by the Rails app still resolve, and so the "cache then promote to
 * store" two-step the models relied on still has somewhere to live.
 */
export interface ShrineData {
  id: string;
  storage: 'cache' | 'store';
  metadata: {
    filename?: string | null;
    size?: number | null;
    mime_type?: string | null;
  };
}

export const UPLOAD_MOUNT = '/uploads';

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const ALLOWED_IMAGE_EXT = /\.(jpe?g|gif|png|webp)$/i;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function storageDir(storage: 'cache' | 'store'): string {
  return join(env.uploadsDir, storage);
}

export function uploadUrl(data: ShrineData | null | undefined): string | null {
  if (!data?.id) return null;
  return `${UPLOAD_MOUNT}/${data.storage}/${data.id}`;
}

export function absoluteUploadUrl(data: ShrineData | null | undefined): string | null {
  const relative = uploadUrl(data);
  return relative ? `${env.publicUrl}${relative}` : null;
}

/** Tolerates both a parsed object and the raw JSON string the old rows may hold. */
export function parseShrineData(value: unknown): ShrineData | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as ShrineData;
    } catch {
      return null;
    }
  }
  if (typeof value === 'object' && 'id' in (value as Record<string, unknown>)) return value as ShrineData;
  return null;
}

function generatedId(originalName: string | undefined): string {
  const ext = originalName ? extname(originalName).toLowerCase() : '';
  const token = randomBytes(16).toString('hex');
  // two-character shard directory, as Shrine's default id generator does
  return `${token.slice(0, 2)}/${token.slice(2)}${ext}`;
}

export function assertImageUpload(filename: string | undefined, mimeType: string | undefined): void {
  if (!filename || !ALLOWED_IMAGE_EXT.test(filename)) {
    throw new AppError('Invalid File');
  }
  if (mimeType && !ALLOWED_IMAGE_MIME.has(mimeType)) {
    throw new AppError('Invalid File');
  }
}

/** Writes a stream into the cache area and returns its Shrine descriptor. */
export async function storeUpload(
  stream: Readable,
  options: { filename?: string; mimeType?: string; storage?: 'cache' | 'store'; validateImage?: boolean } = {},
): Promise<ShrineData> {
  if (options.validateImage !== false) assertImageUpload(options.filename, options.mimeType);

  const storage = options.storage ?? 'cache';
  const id = generatedId(options.filename);
  const target = join(storageDir(storage), id);
  await mkdir(dirname(target), { recursive: true });

  let size = 0;
  stream.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > MAX_UPLOAD_BYTES) stream.destroy(new AppError('ファイルサイズが大きすぎます（最大20MB）'));
  });

  await pipeline(stream, createWriteStream(target));
  const stats = await stat(target);

  return {
    id,
    storage,
    metadata: {
      filename: options.filename ?? null,
      size: stats.size,
      mime_type: options.mimeType ?? null,
    },
  };
}

/**
 * Shrine's `attacher.promote(action: :store)` — the models ran this in a
 * before_create so a file only moves out of the cache once its row survives
 * validation.
 */
export async function promoteUpload(data: ShrineData): Promise<ShrineData> {
  if (data.storage === 'store') return data;
  const from = join(storageDir('cache'), data.id);
  const to = join(storageDir('store'), data.id);
  if (!existsSync(from)) {
    logger.warn({ id: data.id }, 'promoteUpload: cached file is gone, keeping the record as-is');
    return { ...data, storage: 'store' };
  }
  await mkdir(dirname(to), { recursive: true });
  const { rename, copyFile } = await import('node:fs/promises');
  try {
    await rename(from, to);
  } catch {
    // different devices: copy then unlink
    await copyFile(from, to);
    await rm(from, { force: true });
  }
  return { ...data, storage: 'store' };
}

/** Shrine's `attacher.destroy`, run from the models' after_commit on destroy. */
export async function destroyUpload(data: ShrineData | null | undefined): Promise<void> {
  if (!data?.id) return;
  const target = join(storageDir(data.storage), data.id);
  await rm(target, { force: true }).catch((error: unknown) => {
    logger.warn({ error, id: data.id }, 'destroyUpload failed');
  });
}

/** Downloads a remote image (the LINE profile picture at signup) into the store. */
export async function storeRemoteUpload(url: string): Promise<ShrineData | null> {
  try {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      logger.warn({ url, status: response.status }, 'storeRemoteUpload: unexpected response');
      return null;
    }
    const mimeType = response.headers.get('content-type') ?? 'image/jpeg';
    const ext = mimeType.includes('png') ? '.png' : mimeType.includes('gif') ? '.gif' : '.jpg';
    const { Readable } = await import('node:stream');
    const stream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
    return await storeUpload(stream, {
      filename: `remote${ext}`,
      mimeType,
      storage: 'store',
      validateImage: false,
    });
  } catch (error) {
    logger.warn({ error, url }, 'storeRemoteUpload failed');
    return null;
  }
}

export async function ensureUploadDirs(): Promise<void> {
  await mkdir(storageDir('cache'), { recursive: true });
  await mkdir(storageDir('store'), { recursive: true });
  await mkdir(env.castPicturesDir, { recursive: true });
}
