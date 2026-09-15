import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { createPrivateConversation } from '@/server/services/conversations';
import { createMessage } from '@/server/services/messages';
import { enqueueMessageBroadcast } from '@/server/jobs/queues';
import { requireUser } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** users: POST /users/follow_recommendation */
export const POST = route(async (request) => {
  const user = await requireUser();
  const body = z.object({ castIds: z.array(z.coerce.number()) }).parse(await jsonBody(request));

  if (body.castIds.length < 7) {
    throw new AppError('タイプを7人以上選んで下さい。', { redirect: '/users/cast_recommendations' });
  }

  const casts = await prisma.user.findMany({
    where: { userType: 'cast', id: { in: body.castIds }, discardedAt: null },
    take: 50,
  });
  if (!casts.length) throw new AppError('キャストが見つかりません。');

  const { findConversationWithPartner } = await import('@/server/services/conversations');
  const existing = await findConversationWithPartner(user.id, casts[0].id, { onlyPrivate: true });
  if (existing) throw new AppError('チャットルームすでにあります。', { redirect: '/profile' });

  for (const partner of casts) {
    const conversation = await createPrivateConversation(user.id, partner.id);
    const message = await createMessage({
      conversationId: conversation.id,
      senderId: user.id,
      category: 'internal',
      content: '<img src="/system/profile-initial-liked.png">',
      withUnread: true,
      withBroadcast: false,
      withoutFormat: true,
    });
    await enqueueMessageBroadcast(message.id, [partner.id]);
  }

  return { ok: true, redirect: '/profile' };
});
