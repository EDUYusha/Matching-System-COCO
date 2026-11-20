import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { NextResponse, type NextRequest } from 'next/server';
import { resolveUploadPath } from '@/server/lib/upload-path';

/**
 * Serves the Shrine upload mount (`UPLOAD_MOUNT` in server/lib/uploads.ts).
 *
 * Rails served these as static files out of `public/uploads`, so every
 * `*_data` column's url resolved without an application route. Next serves
 * static files only from `public/`, and the uploads directory is deliberately
 * outside it (it is user-writable and shared with the worker), so nothing
 * answered `/uploads/...` at all: every profile picture, post picture and
 * picture message was a 404.
 *
 * Which paths are reachable, and the guard against escaping the mount, are in
 * server/lib/upload-path.ts so they can be tested directly.
 */

async function respond(request: NextRequest, segments: string[], withBody: boolean): Promise<Response> {
  const target = resolveUploadPath(segments);
  if (!target) return new NextResponse('Not Found', { status: 404 });

  let size: number;
  let modified: Date;
  try {
    const stats = await stat(target.path);
    if (!stats.isFile()) return new NextResponse('Not Found', { status: 404 });
    size = stats.size;
    modified = stats.mtime;
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }

  // the ids are random hex, so a file in `store` never changes under its url;
  // `cache` holds the pre-promotion copy, which is short-lived by design
  const etag = `"${size.toString(16)}-${modified.getTime().toString(16)}"`;
  const headers = new Headers({
    'Content-Type': target.contentType,
    'Content-Length': String(size),
    ETag: etag,
    'Last-Modified': modified.toUTCString(),
    'Cache-Control':
      target.storage === 'store' ? 'public, max-age=31536000, immutable' : 'private, max-age=60',
    'X-Content-Type-Options': 'nosniff',
  });

  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers });
  }
  if (!withBody) return new NextResponse(null, { status: 200, headers });

  const stream = Readable.toWeb(createReadStream(target.path)) as ReadableStream<Uint8Array>;
  return new NextResponse(stream, { status: 200, headers });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  return respond(request, path, true);
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  return respond(request, path, false);
}
