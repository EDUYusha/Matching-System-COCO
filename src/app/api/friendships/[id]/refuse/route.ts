import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { ForbiddenError } from '@/server/lib/errors';
import { systemMessageToUser } from '@/server/services/messages';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** misc: POST /friendships/:id/refuse */
export const POST = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const friendship = await prisma.friendship.findUniqueOrThrow({ where: { id: params.id } });
  if (friendship.friendId !== user.id) throw new ForbiddenError('許可がありません。', '/friendships');

  await prisma.friendship.delete({ where: { id: friendship.id } });
  await systemMessageToUser(friendship.userId, {
    withBroadcast: true,
    withUnread: true,
    content: `${user.nickName}はあなたの友達依頼に断りました。\n`,
  });

  return { ok: true, redirect: '/friendships', flash: { type: 'notice', message: '友達申請を断りました。' } };
});
