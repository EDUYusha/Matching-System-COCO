import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { ForbiddenError } from '@/server/lib/errors';
import { systemMessageToUser } from '@/server/services/messages';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** misc: POST /friendships/:id/cancel */
export const POST = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const friendship = await prisma.friendship.findUniqueOrThrow({ where: { id: params.id } });
  if (friendship.userId !== user.id) throw new ForbiddenError('許可がありません。', '/friendships');

  const counterpart = await prisma.friendship.findUnique({
    where: { userId_friendId: { userId: friendship.friendId, friendId: friendship.userId } },
  });

  await prisma.$transaction(async (t) => {
    await t.friendship.delete({ where: { id: friendship.id } });
    if (friendship.mutual && counterpart) await t.friendship.delete({ where: { id: counterpart.id } });
  });

  await systemMessageToUser(friendship.friendId, {
    withBroadcast: true,
    withUnread: true,
    content: friendship.mutual
      ? `${user.nickName}はあなたの友達申請を断りました。\n`
      : `${user.nickName}は友達申請をキャンセルしました。\n`,
  });

  return { ok: true, redirect: '/friendships', flash: { type: 'notice', message: '友情申請を取り消しました。' } };
});
