import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { snsAuthorize, snsCsrfToken } from '@/server/services/sns';
import { env } from '@/server/config/env';
import { setSession } from '@/server/auth/session';
import { readSession } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
import { loginPreparations } from '@/server/api/sessions-shared';
export const dynamic = 'force-dynamic';

/** sessions: POST /sns_login_return */
export const POST = route(async (request) => {
  const body = z.object({ code: z.string(), state: z.string() }).parse(await jsonBody(request));
  const scratch = (await readSession())?.scratch ?? {};

  // ApplicationController#verify_sns_response
  if (!scratch.sns_csrf || body.state !== snsCsrfToken(scratch.sns_csrf)) {
    throw new AppError('Security token is invalid');
  }

  const redirectUri = `${env.publicUrl}/api/sns_callback?to=${encodeURIComponent(scratch.sns_return ?? '/sns_login_return')}`;
  const result = await snsAuthorize({
    authCode: body.code,
    nonce: scratch.sns_nonce ?? null,
    prevUrl: redirectUri,
  });

  const existing = await prisma.user.findFirst({ where: { snsId: result.snsId, discardedAt: null } });
  if (existing) {
    return loginPreparations(existing);
  }

  // no account yet: carry the LINE profile into the signup form
  await setSession({
    userId: 0,
    scratch: {
      sns_auth_token: body.code,
      sns_id: result.snsId,
      ...(result.snsName ? { sns_name: result.snsName } : {}),
      ...(result.snsProfilePicUrl ? { sns_profile_pic_url: result.snsProfilePicUrl } : {}),
      ...(scratch.inviter_code ? { inviter_code: scratch.inviter_code } : {}),
      ...(scratch.utm_source ? { utm_source: scratch.utm_source } : {}),
    },
  });

  return {
    ok: true,
    newAccount: true,
    redirect: `/users/new${scratch.inviter_code ? `?inviter_code=${encodeURIComponent(scratch.inviter_code)}` : ''}`,
    sns: { name: result.snsName, profilePicUrl: result.snsProfilePicUrl },
  };
});
