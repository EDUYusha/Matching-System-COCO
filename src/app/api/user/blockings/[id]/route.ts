import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { createBlocking, destroyBlocking } from '@/server/services/blockings';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/**
 * BlockingsController#create and #destroy.
 *
 * The two original routes were `POST /user/blockings/:target_id` and
 * `DELETE /user/blockings/:id`. Next allows a path position only one slug name,
 * so both live under `[id]` — the URLs are unchanged, and the segment still
 * means what it always did per verb: the user being blocked on POST, the
 * blocking row being removed on DELETE.
 */

/** users: POST /user/blockings/:targetId — `id` here is the target user. */
export const POST = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const target = await prisma.user.findUniqueOrThrow({ where: { id: params.id } });
  if (['admin', 'operator', 'system'].includes(target.userType)) {
    throw new AppError('管理者をブロックすることはできません', { redirect: '/' });
  }
  if (target.id === user.id) {
    throw new AppError('自分をブロックすることはできません', { redirect: '/' });
  }

  const existing = await prisma.blocking.findUnique({
    where: { targetId_userId: { targetId: target.id, userId: user.id } },
  });
  if (existing) {
    return {
      ok: true,
      redirect: '/conversations',
      flash: { type: 'notice', message: '既にブロックされたユーザーです。' },
    };
  }

  await createBlocking(user.id, target.id);

  return {
    ok: true,
    redirect: '/conversations',
    flash: { type: 'notice', message: 'ブロックリストに追加しました。' },
  };
});

/** users: DELETE /user/blockings/:id — `id` here is the blocking row. */
export const DELETE = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const blocking = await prisma.blocking.findUniqueOrThrow({ where: { id: params.id } });
  if (blocking.userId !== user.id) {
    throw new AppError('権限がありません。', { redirect: '/', statusCode: 403 });
  }

  await destroyBlocking(blocking.id);

  return {
    ok: true,
    redirect: '/user/blockings',
    flash: { type: 'notice', message: 'ブロックリストから解消しました。' },
  };
});
