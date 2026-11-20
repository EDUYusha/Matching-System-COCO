import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { hashPassword } from '@/server/lib/auth';
import { clientIp, jsonBody, route } from '@/server/http/route';
import { enforceRateLimit, RATE_LIMITS } from '@/server/lib/rate-limit';
export const dynamic = 'force-dynamic';

/** sessions: POST /reset_password */
export const POST = route(async (request) => {
  const body = z
    .object({
      email: z.string(),
      password: z.string(),
      passwordConfirmation: z.string(),
      // never optional: without it the lookup would match on the email alone,
      // which let anyone reset any account
      restorationToken: z.string().min(1),
    })
    .parse(await jsonBody(request));

  // the token is 32 random bytes, but nothing stopped a caller trying
  // tokens as fast as the network allowed
  await enforceRateLimit('password-reset-ip', clientIp(request), RATE_LIMITS.passwordResetPerIp);

  const user = await prisma.user.findFirst({
    where: {
      email: body.email,
      discardedAt: null,
      restorationToken: body.restorationToken,
    },
  });
  if (!user) throw new AppError('無効なリマインドトークンです。', { redirect: '/login' });

  // the same two-hour window the GET enforces, so the token cannot be redeemed
  // after the link has expired
  if (!user.lastActivity || user.lastActivity.getTime() < Date.now() - 2 * 60 * 60 * 1000) {
    await prisma.user.update({ where: { id: user.id }, data: { restorationToken: null } });
    throw new AppError(
      'リンクは有効期限が切れております。パスワード再設定を最初からお試しください。',
      { redirect: '/login' },
    );
  }

  if (body.password.length < 6) {
    throw new AppError('パスワードは6文字以上で入力してください');
  }
  if (body.password !== body.passwordConfirmation) {
    throw new AppError('パスワードが一致しません');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordDigest: await hashPassword(body.password), restorationToken: null },
  });

  return {
    ok: true,
    redirect: '/login',
    flash: {
      type: 'notice',
      message: 'パスワードを更新しました。ログインページよりログインしてご利用いただけます。',
    },
  };
});
