import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { logger } from '@/server/lib/logger';

/**
 * The response contract of the old InternalApi controllers.
 *
 * The CakePHP panel ignores the HTTP status completely — all four of its call
 * sites branch on the body alone, and two of them read an empty body as
 * success:
 *
 *     if ($result->getBody() == '' || $resultBody->error !== '') { 登録処理完了 }
 *
 * So the body is the compatibility contract and the status is for our own
 * screens and the logs. Two consequences shape this module:
 *
 *   1. Success renders nothing. `head :ok` (200, no body) is what the old
 *      actions returned, and an empty body is the only shape all four call
 *      sites accept. A JSON `{"error":"","ok":true}` fails the
 *      finish/complete test above and shows the operator 登録処理失敗 on a
 *      call that in fact succeeded.
 *   2. Failure renders what Rails rendered, including the status: a JSON
 *      `error` — a string on most actions, an array of `full_messages` on
 *      `create` and `unread_messages` — or, where the old exception was
 *      unrescued, one of Rails' static error pages, which carry no `error`
 *      key at all.
 *
 * There is no 422 anywhere in the old API. A 422 carrying a field map is the
 * worst answer we can give the panel: no `error` key means `$resultBody->error`
 * is null, `null !== ''` is true, and the operator is told a cancellation that
 * charged nothing was completed.
 */

/** `head :ok`. Blockings rendered nothing at all, which Rails sent as 204. */
export function railsOk(status: 200 | 204 = 200): NextResponse {
  return new NextResponse(null, { status });
}

/** `render json: { error: … }, status: …` */
export class RailsRenderedError extends Error {
  readonly railsStatus: number;
  readonly railsError: string | string[];

  constructor(status: number, error: string | string[]) {
    super(Array.isArray(error) ? error.join(' / ') : error);
    this.name = 'RailsRenderedError';
    this.railsStatus = status;
    this.railsError = error;
  }
}

/** A status guard or a mandatory-parameter check: 400 with the message. */
export function railsBadRequest(error: string | string[]): RailsRenderedError {
  return new RailsRenderedError(400, error);
}

/** A rescued exception or a model validation: 500 with the message or messages. */
export function railsServerError(error: string | string[]): RailsRenderedError {
  return new RailsRenderedError(500, error);
}

/** `ActionController::ParameterMissing` from `params.require(:x)`. */
export class RailsParameterMissing extends Error {
  constructor(readonly param: string) {
    super(`param is missing or the value is empty: ${param}`);
    this.name = 'RailsParameterMissing';
  }
}

/** `ActiveRecord::RecordNotFound` from `Meeting.find(id)` and friends. */
export class RailsRecordNotFound extends Error {
  constructor(message = 'record not found') {
    super(message);
    this.name = 'RailsRecordNotFound';
  }
}

/*
 * Rails' static error pages, as `ActionDispatch::PublicExceptions` served them:
 * public/404.html and public/500.html from the app skeleton, and the generated
 * fallback for a status with no page of its own. They matter only in that they
 * are not JSON — the panel finds no `error` key in them, which is exactly what
 * it found before.
 */
const RAILS_404_PAGE = `<!DOCTYPE html>
<html>
<head>
  <title>The page you were looking for doesn't exist (404)</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body>
  <h1>The page you were looking for doesn't exist.</h1>
  <p>You may have mistyped the address or the page may have moved.</p>
</body>
</html>
`;

const RAILS_500_PAGE = `<!DOCTYPE html>
<html>
<head>
  <title>We're sorry, but something went wrong (500)</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body>
  <h1>We're sorry, but something went wrong.</h1>
</body>
</html>
`;

const RAILS_400_PAGE = '<html><body><h1>400 Bad Request</h1></body></html>';

function htmlResponse(status: number, body: string): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function isPrismaNotFound(error: unknown): boolean {
  return (error as { code?: string }).code === 'P2025';
}

/** Maps a thrown value onto the response the Rails action would have rendered. */
export function internalApiError(error: unknown): NextResponse {
  if (error instanceof RailsRenderedError) {
    return NextResponse.json({ error: error.railsError }, { status: error.railsStatus });
  }

  if (error instanceof RailsParameterMissing) {
    logger.warn({ param: error.param }, 'internal_api: parameter missing');
    return htmlResponse(400, RAILS_400_PAGE);
  }

  if (error instanceof RailsRecordNotFound || isPrismaNotFound(error)) {
    return htmlResponse(404, RAILS_404_PAGE);
  }

  /*
   * A schema rejection should no longer be reachable on these endpoints — the
   * coercions in params.ts replaced them — so it is logged loudly. The response
   * is the model-validation shape, an array of messages, because that is the
   * nearest thing the old API had to "your input was wrong".
   */
  if (error instanceof ZodError) {
    logger.error({ issues: error.issues }, 'internal_api: a schema rejected input Ruby would have coerced');
    return NextResponse.json(
      { error: error.issues.map((issue) => `${issue.path.join('.') || 'base'} ${issue.message}`) },
      { status: 500 },
    );
  }

  // an unrescued Ruby exception: the 500 page, no JSON
  logger.error({ error }, 'internal_api: unhandled error');
  return htmlResponse(500, RAILS_500_PAGE);
}

type Context<P> = { params: Promise<P> };

type InternalApiHandler<P> = (
  request: NextRequest,
  context: { params: P },
) => Promise<NextResponse | void>;

/**
 * The adapter the internal-api handlers are written against, in place of the
 * app-wide `route()`: same shape, but the error envelope and the success body
 * are the old API's rather than our own screens'.
 */
export function internalApiRoute<P = Record<string, string>>(handler: InternalApiHandler<P>) {
  return async (request: NextRequest, context: Context<P>): Promise<NextResponse> => {
    try {
      const params = (await context?.params) ?? ({} as P);
      const result = await handler(request, { params });
      return result ?? railsOk();
    } catch (error) {
      return internalApiError(error);
    }
  };
}
