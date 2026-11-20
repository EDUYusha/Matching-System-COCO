import { z } from 'zod';
import { NextResponse } from 'next/server';
import { env } from '@/server/config/env';
import { logger } from '@/server/lib/logger';
import { queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/**
 * The redirect_uri every LINE login is started with — and, until now, the one
 * thing in that flow nobody had written.
 *
 * `sns_login_redirection`, `sns_login_return` and `user/add_sns` all build
 * `${PUBLIC_URL}/api/sns_callback?to=...` and hand it to LINE, which means LINE
 * sent the member straight back to a 404. Logging in with LINE could not work
 * at all, in any environment. The redirect_uri also has to be byte-identical
 * when the auth code is exchanged, so it could not simply be pointed somewhere
 * else: this path is the one the authorize call already committed to.
 *
 * LINE delivers the result as a browser navigation, so this is a redirect, not
 * an API: it hands `code` and `state` to the screen named by `to`, which posts
 * them to the matching endpoint.
 */

/** Only the three paths sns_login_redirection can set. `to` comes back from LINE. */
const RETURN_PATHS = new Set(['/sns_login_return', '/cast/new', '/user/add_sns']);

export const GET = route(async (_request, { searchParams }) => {
  const query = z
    .object({
      to: z.string().optional(),
      code: z.string().optional(),
      state: z.string().optional(),
      error: z.string().optional(),
      error_description: z.string().optional(),
    })
    .parse(queryObject(searchParams));

  const to = query.to && RETURN_PATHS.has(query.to) ? query.to : '/sns_login_return';

  // the member cancelled on LINE's consent screen, or LINE refused
  if (query.error || !query.code || !query.state) {
    logger.warn(
      { error: query.error, description: query.error_description, to },
      'sns_callback: LINE returned no authorization code',
    );
    return NextResponse.redirect(new URL('/login?sns_error=1', env.publicUrl));
  }

  const target = new URL(to, env.publicUrl);
  target.searchParams.set('code', query.code);
  target.searchParams.set('state', query.state);
  return NextResponse.redirect(target);
});
