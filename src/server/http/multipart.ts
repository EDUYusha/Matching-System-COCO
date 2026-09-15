import { Readable } from 'node:stream';
import type { NextRequest } from 'next/server';

/**
 * Multipart uploads, in the shape the ported services already expect.
 *
 * Fastify's plugin handed handlers an async iterator of parts, each with a
 * `.file` Node stream. Next gives a web `FormData` of `File` objects instead, so
 * each file is adapted back to a Node `Readable` — `storeUpload` pipes it
 * straight to disk and never buffers the whole upload.
 */

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
