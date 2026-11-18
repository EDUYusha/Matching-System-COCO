import { NextResponse, type NextRequest } from 'next/server';

/**
 * Two URL rules the CakePHP operator panel depends on.
 *
 * 1. The panel and the cron host call `/internal_api/...`, the path the Rails
 *    routes had. Next serves Route Handlers under `/api`, so those requests are
 *    rewritten — not redirected — and arrive with their method, headers and
 *    body intact. `/api/internal_api/...` keeps working for our own screens.
 *
 * 2. Six of the panel's call sites end in a slash (`/internal_api/unread_messages/?message_id=N`).
 *    Rails routed that to the same action; Next's default is a 308 to the
 *    slashless path, which PEAR `HTTP_Request2` does not follow — and the panel
 *    reads the empty redirect body as success, so the call would look fine and
 *    do nothing. `skipTrailingSlashRedirect` in next.config.ts turns that
 *    default off, and the slash is simply trimmed here instead.
 *
 * Everything outside `/internal_api` keeps the behaviour it had before the flag:
 * a trailing slash redirects, so `/faq/` still reaches `/faq`.
 */

const INTERNAL_API_PREFIX = '/internal_api';

/** '/faq/' -> '/faq', '/' -> '/' */
function withoutTrailingSlash(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
}

/*
 * The URLs are built with `new URL(..., request.url)` rather than by cloning
 * `request.nextUrl`: a clone carries the request's own trailing slash and puts
 * it back on assignment, which turns the redirect below into a loop.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  if (pathname === INTERNAL_API_PREFIX || pathname.startsWith(`${INTERNAL_API_PREFIX}/`)) {
    return NextResponse.rewrite(
      new URL(`/api${withoutTrailingSlash(pathname)}${search}`, request.url),
    );
  }

  if (pathname.length > 1 && pathname.endsWith('/')) {
    return NextResponse.redirect(new URL(`${withoutTrailingSlash(pathname)}${search}`, request.url), 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
