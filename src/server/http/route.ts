import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { AppError } from '@/server/lib/errors';
import { logger } from '@/server/lib/logger';

/**
 * The adapter every Route Handler is written against.
 *
 * It exists so the ~200 handlers stay the three interesting lines each — parse,
 * call a service, return — while the uninteresting parts (the error envelope,
 * query coercion, the JSON body) are written once.
 *
 * The envelope is the one the original controllers implied: a message plus the
 * `redirect` the Rails action would have issued and the flash it would have set,
 * so `redirect_to … alert:` survives as data the client acts on.
 */

export interface ApiErrorBody {
  error: string;
  details?: Record<string, string[]>;
  redirect?: string;
  flash?: { type: string; message: string };
}

export function errorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ZodError) {
    const details: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join('.') || 'base';
      details[key] = details[key] ?? [];
      details[key].push(issue.message);
    }
    return NextResponse.json(
      { error: Object.values(details).flat().join('\n') || '入力内容をご確認ください', details },
      { status: 422 },
    );
  }

  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: error.message,
        details: error.details,
        redirect: error.redirect,
        flash: { type: error.flashType, message: error.message },
      },
      { status: error.statusCode },
    );
  }

  // Prisma's "not found" from findUniqueOrThrow
  if ((error as { code?: string }).code === 'P2025') {
    return NextResponse.json({ error: '見つかりませんでした' }, { status: 404 });
  }

  logger.error({ error }, 'unhandled route error');
  return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
}

/** Route params arrive as a promise in Next 15+. */
type Context<P> = { params: Promise<P> };

type Handler<P> = (
  request: NextRequest,
  context: { params: P; searchParams: URLSearchParams },
) => Promise<unknown>;

/**
 * Wraps a handler so thrown errors become the envelope and a returned value
 * becomes JSON. Returning a NextResponse directly (a file download, a redirect)
 * passes through untouched.
 */
export function route<P = Record<string, string>>(handler: Handler<P>) {
  return async (request: NextRequest, context: Context<P>): Promise<NextResponse> => {
    try {
      const params = (await context?.params) ?? ({} as P);
      const result = await handler(request, {
        params,
        searchParams: request.nextUrl.searchParams,
      });
      if (result instanceof NextResponse) return result;
      if (result === undefined) return NextResponse.json({ ok: true });
      return NextResponse.json(result);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Parses a JSON body, tolerating an empty one so `POST` with no payload works. */
export async function body<S extends ZodTypeAny>(request: NextRequest, schema: S): Promise<z.infer<S>> {
  let raw: unknown = {};
  const text = await request.text();
  if (text) {
    try {
      raw = JSON.parse(text);
    } catch {
      raw = {};
    }
  }
  return schema.parse(raw) as z.infer<S>;
}

/** Parses the query string. Every value is a string, so schemas use z.coerce. */
export function query<S extends ZodTypeAny>(searchParams: URLSearchParams, schema: S): z.infer<S> {
  return schema.parse(Object.fromEntries(searchParams.entries())) as z.infer<S>;
}

/** `?ids=1&ids=2` and `?ids[]=1` both become a list. */
export function queryList(searchParams: URLSearchParams, key: string): string[] {
  return [...searchParams.getAll(key), ...searchParams.getAll(`${key}[]`)];
}

/**
 * The three input helpers the translated handlers use.
 *
 * They are shaped so a `Schema.parse(request.body)` from the Fastify original
 * becomes `Schema.parse(await jsonBody(request))` — same call, same schema.
 */

/** The JSON body, or `{}` when there is none, so a bodyless POST still parses. */
export async function jsonBody(request: NextRequest): Promise<unknown> {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

/** The query string as a plain object; repeated keys collapse to a list. */
export function queryObject(searchParams: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    out[key] = values.length > 1 ? values : values[0];
  }
  return out;
}

/**
 * The caller's address, for InternalApi::BaseController#must_be_local_request.
 * Behind a proxy Next sees the proxy, so the forwarded chain wins when present.
 */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? '127.0.0.1';
}
