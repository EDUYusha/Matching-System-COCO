import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { snsAuthorize, snsCsrfToken } from '@/server/services/sns';
import { env } from '@/server/config/env';
import { readSession, requireUser } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** users: POST /user/add_sns */
export const POST = route(async (request) => {
  const user = await requireUser();
  const body = z.object({ code: z.string(), state: z.string() }).parse(await jsonBody(request));
  const scratch = (await readSession())?.scratch ?? {};

  if (!scratch.sns_csrf || body.state !== snsCsrfToken(scratch.sns_csrf)) {
    throw new AppError('Security token is invalid');
  }

  const redirectUri = `${env.publicUrl}/api/sns_callback?to=${encodeURIComponent('/user/add_sns')}`;
  const result = await snsAuthorize({
    authCode: body.code,
    nonce: scratch.sns_nonce ?? null,
    prevUrl: redirectUri,
  });

  const taken = await prisma.user.findFirst({
    where: { snsId: result.snsId, id: { not: user.id } },
    select: { id: true },
  });
  if (taken) {
    throw new AppError('このログイン情報はもう他のアカウントで登録しています。', { redirect: '/help' });
  }

  await prisma.user.update({ where: { id: user.id }, data: { snsId: result.snsId } });
  return {
    ok: true,
    redirect: '/help',
    flash: { type: 'notice', message: 'アカウントを追加しました。今からそのアカウントでもログインできます。' },
  };
});
