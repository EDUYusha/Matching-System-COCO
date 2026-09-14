import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { hashPassword, verifyPassword } from '@/server/lib/auth';
import { requireUser } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** users: POST /user/password */
export const POST = route(async (request) => {
  const user = await requireUser();
  const body = z
    .object({
      currentPassword: z.string(),
      password: z.string(),
      passwordConfirmation: z.string(),
    })
    .parse(await jsonBody(request));

  if (!(await verifyPassword(body.currentPassword, user.passwordDigest))) {
    throw new AppError('現在のパスワードの間違いがあります', { statusCode: 422 });
  }
  if (!body.password) throw new AppError('パスワードは必須項目です', { statusCode: 422 });
  if (body.password.length < 6) throw new AppError('パスワードは6文字以上で入力してください', { statusCode: 422 });
  if (body.password !== body.passwordConfirmation) {
    throw new AppError('パスワードが一致しません', { statusCode: 422 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordDigest: await hashPassword(body.password) },
  });
  return { ok: true, redirect: '/help', flash: { type: 'notice', message: '更新しました' } };
});
