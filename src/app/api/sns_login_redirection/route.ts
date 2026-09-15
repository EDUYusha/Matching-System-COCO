import { z } from 'zod';
import { urlsafeBase64 } from '@/server/lib/auth';
import { generateNonce, lineAuthorizeUrl, snsCsrfToken } from '@/server/services/sns';
import { env } from '@/server/config/env';
import { setSession } from '@/server/auth/session';
import { currentUser } from '@/server/auth/session';
import { queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** sessions: GET /sns_login_redirection */
export const GET = route(async (_request, { searchParams }) => {
  const query = z
    .object({
      cast_registration: z.string().optional(),
      add_login_method: z.string().optional(),
      inviter_code: z.string().optional(),
      utm_source: z.string().optional(),
    })
    .parse(queryObject(searchParams));

  const nonce = generateNonce();
  const scratchSecret = urlsafeBase64();

  const returnPath = query.cast_registration
    ? '/cast/new'
    : query.add_login_method
      ? '/user/add_sns'
      : '/sns_login_return';
  const redirectUri = `${env.publicUrl}/api/sns_callback?to=${encodeURIComponent(returnPath)}`;

  await setSession({
    userId: (await currentUser())?.id ?? 0,
    scratch: {
      sns_nonce: nonce,
      sns_csrf: scratchSecret,
      sns_return: returnPath,
      ...(query.inviter_code ? { inviter_code: query.inviter_code } : {}),
      ...(query.utm_source ? { utm_source: query.utm_source } : {}),
    },
  });

  return {
    url: lineAuthorizeUrl({ redirectUri, state: snsCsrfToken(scratchSecret), nonce }),
  };
});
