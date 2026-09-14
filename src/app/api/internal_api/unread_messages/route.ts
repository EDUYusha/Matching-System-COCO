import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** internal-api: POST /internal_api/unread_messages */
export const POST = route(async (request) => {
  const body = z.object({ message_id: z.coerce.number() }).parse(await jsonBody(request));

  const message = await prisma.message.findUniqueOrThrow({ where: { id: body.message_id } });
  const speakers = await prisma.speaker.findMany({
    where: { conversationId: message.conversationId },
    select: { userId: true, ignoring: true },
  });
  const blockers = await prisma.blocking.findMany({
    where: { targetId: message.senderId },
    select: { userId: true },
  });
  const blockerIds = new Set(blockers.map((blocking) => blocking.userId));

  const rows = speakers
    .filter((speaker) => speaker.userId !== message.senderId)
    .map((speaker) => ({
      userId: speaker.userId,
      messageId: message.id,
      conversationId: message.conversationId,
      ignored: speaker.ignoring || blockerIds.has(speaker.userId),
    }));
  if (rows.length) await prisma.unreadMessage.createMany({ data: rows, skipDuplicates: true });

  // the broadcast is enqueued by the message's own commit hook; doing it here
  // too would notify twice (the comment the original gained in 2026)
  const { enqueueMessageBroadcast } = await import('@/server/jobs/queues');
  await enqueueMessageBroadcast(message.id);

  return { ok: true };
});
