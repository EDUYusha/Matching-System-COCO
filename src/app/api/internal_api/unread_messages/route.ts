import { prisma } from '@/server/lib/prisma';
import { railsPresence, railsToInt, requestParams } from '@/server/http/params';
import {
  internalApiRoute,
  railsBadRequest,
  railsServerError,
  RailsRecordNotFound,
} from '@/server/http/internal-api';
export const dynamic = 'force-dynamic';

/**
 * internal-api: POST /internal_api/unread_messages
 *
 * Six call sites in the panel reach this, and none of them is sending a message:
 * the panel writes the `messages` row itself with the CakePHP ORM and then pings
 * here so the unread rows and the push happen. The old action did that by setting
 * `with_broadcast = true` and saving, which let the model's `after_commit` hook
 * do the pushing — a row written by another process gets no hook here, so the
 * broadcast is enqueued explicitly. Doing both is what sent every notification
 * twice in the old system, so `createMessage` must not also be called.
 */
export const POST = internalApiRoute(async (request) => {
  // `?message_id=N`, in the query string
  const params = await requestParams(request);
  if (railsPresence(params.message_id) === null) {
    throw railsBadRequest('message_id parameter is mandatory');
  }

  // `Message.find("abc")` looked for id 0 and raised RecordNotFound
  const message = await prisma.message.findUnique({ where: { id: railsToInt(params.message_id) } });
  if (!message) throw new RailsRecordNotFound();

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

  try {
    if (rows.length) await prisma.unreadMessage.createMany({ data: rows, skipDuplicates: true });
  } catch (error) {
    // the old action rendered the record's full_messages here, as an array
    throw railsServerError([(error as Error).message]);
  }

  const { enqueueMessageBroadcast } = await import('@/server/jobs/queues');
  await enqueueMessageBroadcast(message.id);
});
