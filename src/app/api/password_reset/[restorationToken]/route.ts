import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** sessions: GET /password_reset/:restorationToken */
export const GET = route<{ restorationToken: string }>(async (_request, { params: routeParams }) => {
  const params = z.object({ restorationToken: z.string() }).parse(routeParams);
  const user = await prisma.user.findFirst({
    where: { restorationToken: params.restorationToken, discardedAt: null },
  });

  if (!user) {
    throw new AppError('無効なリマインドトークンです。', { redirect: '/login' });
  }
  // the original reuses last_activity as the token's issue time
  if (!user.lastActivity || user.lastActivity.getTime() < Date.now() - 2 * 60 * 60 * 1000) {
    await prisma.user.update({ where: { id: user.id }, data: { restorationToken: null } });
    throw new AppError(
      'リンクは有効期限が切れております。パスワード再設定を最初からお試しください。',
      { redirect: '/login' },
    );
  }

  return { ok: true, email: user.email };
});
