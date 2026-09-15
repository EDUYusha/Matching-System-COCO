import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { hashPassword } from '@/server/lib/auth';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** sessions: POST /reset_password */
export const POST = route(async (request) => {
  const body = z
    .object({
      email: z.string(),
      password: z.string(),
      passwordConfirmation: z.string(),
      restorationToken: z.string().optional(),
    })
    .parse(await jsonBody(request));

  const user = await prisma.user.findFirst({
    where: {
      email: body.email,
      discardedAt: null,
      ...(body.restorationToken ? { restorationToken: body.restorationToken } : {}),
    },
  });
  if (!user) throw new AppError('無効なリマインドトークンです。', { redirect: '/login' });

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
