import { z } from 'zod';
import { createMessage, createSystemMessage } from '@/server/services/messages';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** internal-api: POST /internal_api/messages */
export const POST = route(async (request) => {
  const body = z
    .object({
      conversation_id: z.coerce.number(),
      content: z.string(),
      sender_id: z.coerce.number().optional(),
      category: z.enum(['text', 'picture', 'sticker', 'service', 'internal']).optional(),
      with_unread: z.boolean().optional(),
      with_broadcast: z.boolean().optional(),
    })
    .parse(await jsonBody(request));

  const message = body.sender_id
    ? await createMessage({
        conversationId: body.conversation_id,
        senderId: body.sender_id,
        content: body.content,
        category: body.category ?? 'text',
        withUnread: body.with_unread ?? true,
        withBroadcast: body.with_broadcast ?? true,
      })
    : await createSystemMessage({
        conversationId: body.conversation_id,
        content: body.content,
        category: body.category ?? 'text',
        withUnread: body.with_unread ?? true,
        withBroadcast: body.with_broadcast ?? true,
      });

  return { ok: true, messageId: message.id };
});
