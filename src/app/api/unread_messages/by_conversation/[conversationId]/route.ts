import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { enqueueInformRead } from '@/server/jobs/queues';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** conversations: DELETE /unread_messages/by_conversation/:conversationId */
export const DELETE = route<{ conversationId: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ conversationId: z.coerce.number() }).parse(routeParams);

  const unreads = await prisma.unreadMessage.findMany({
    where: { userId: user.id, conversationId: params.conversationId },
    select: { id: true, messageId: true },
  });
  const messageIds = unreads.map((unread) => unread.messageId).filter((id): id is number => id !== null);

  await enqueueInformRead({
    conversationId: params.conversationId,
    readerId: user.id,
    messageIds,
  });
  const { count } = await prisma.unreadMessage.deleteMany({
    where: { id: { in: unreads.map((unread) => unread.id) } },
  });

  return { removed: count };
});
