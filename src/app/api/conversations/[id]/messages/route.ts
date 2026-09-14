import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { ForbiddenError } from '@/server/lib/errors';
import { toMessageDto } from '@/server/lib/serializers';
import { createMessage } from '@/server/services/messages';
import { requireUser } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** conversations: POST /conversations/:id/messages */
export const POST = route<{ id: string }>(async (request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z.object({ content: z.string().min(1) }).parse(await jsonBody(request));

  const speaker = await prisma.speaker.findFirst({
    where: { conversationId: params.id, userId: user.id },
  });
  if (!speaker) throw new ForbiddenError('権利がありません');

  const message = await createMessage({
    conversationId: params.id,
    senderId: user.id,
    content: body.content,
    withUnread: true,
    withBroadcast: true,
  });

  return { ok: true, message: toMessageDto({ ...message, sender: user }, { viewerId: user.id }) };
});
