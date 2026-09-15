import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { createPrivateConversation } from '@/server/services/conversations';
import { createMessage } from '@/server/services/messages';
import { enqueueMessageBroadcast } from '@/server/jobs/queues';
import { requireUser } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
// pulls in the request.file() / request.files() type augmentation

export const dynamic = 'force-dynamic';

/** cast: POST /cast/follow_recommendation */
export const POST = route(async (request) => {
  const user = await requireUser();
  const body = z.object({ castIds: z.array(z.coerce.number()) }).parse(await jsonBody(request));

  if (user.userType !== 'cast' || user.customersSelected) {
    throw new AppError('その操作はできません。', { statusCode: 403 });
  }

  const partners = await prisma.user.findMany({
    where: { userType: { in: ['customer', 'inviter'] }, id: { in: body.castIds }, discardedAt: null },
    take: 50,
  });

  for (const partner of partners) {
    const conversation = await createPrivateConversation(user.id, partner.id);
    const message = await createMessage({
      conversationId: conversation.id,
      senderId: user.id,
      category: 'internal',
      content: '<img src="/system/profile-initial-liked-cast.png?20220427"/>',
      withUnread: true,
      withBroadcast: false,
      withoutFormat: true,
    });
    await enqueueMessageBroadcast(message.id, [partner.id]);
  }

  await prisma.user.update({ where: { id: user.id }, data: { customersSelected: true } });

  return { ok: true, redirect: '/conversations', flash: { type: 'notice', message: 'ありがとうございます' } };
});
