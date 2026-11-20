import { Readable } from 'node:stream';
import type { NextRequest } from 'next/server';
import { AppError } from '@/server/lib/errors';

/**
 * Multipart uploads, in the shape the ported services already expect.
 *
 * Fastify's plugin handed handlers an async iterator of parts, each with a
 * `.file` Node stream. Next gives a web `FormData` of `File` objects instead, so
 * each file is adapted back to a Node `Readable` — `storeUpload` pipes it
 * straight to disk and never buffers the whole upload.
 */

/**
 * Largest multipart body read at all, checked from Content-Length before
 * `request.formData()` is called. The per-file 20MB limit in lib/uploads.ts
 * applies after the body has already been materialised in memory, which is too
 * late to stop a deliberately huge POST from exhausting the process.
 */
const MAX_BODY_BYTES = 25 * 1024 * 1024;

function assertBodyWithinLimit(request: NextRequest): void {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new AppError('ファイルサイズが大きすぎます（最大20MB）');
  }
}

export interface UploadPart {
  /** the form field the file arrived under */
  field: string;
  filename: string;
  mimetype: string;
  file: Readable;
}

function toPart(field: string, file: File): UploadPart {
  return {
    field,
    filename: file.name,
    mimetype: file.type || 'application/octet-stream',
    // Readable.fromWeb is typed against node:stream/web's ReadableStream; the
    // DOM one the File exposes is the same object at runtime
    file: Readable.fromWeb(file.stream() as never),
  };
}

/** Every file in the request body, in form order. */
export async function uploadParts(request: NextRequest): Promise<UploadPart[]> {
  assertBodyWithinLimit(request);
  const form = await request.formData();
  const parts: UploadPart[] = [];
  for (const [field, value] of form.entries()) {
    if (value instanceof File && value.size > 0) parts.push(toPart(field, value));
  }
  return parts;
}

/**
 * The request's files plus its plain text fields, for the handlers that post a
 * record and its pictures in one submission (PostsController#create).
 */
export async function multipart(
  request: NextRequest,
): Promise<{ files: UploadPart[]; fields: Record<string, string> }> {
  assertBodyWithinLimit(request);
  const form = await request.formData();
  const files: UploadPart[] = [];
  const fields: Record<string, string> = {};

  for (const [field, value] of form.entries()) {
    if (value instanceof File) {
      if (value.size > 0) files.push(toPart(field, value));
    } else {
      fields[field] = value;
    }
  }

  return { files, fields };
}
