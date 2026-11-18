import { z } from 'zod';
import { createMessage, createSystemMessage } from '@/server/services/messages';
import { railsBoolean, requestParams } from '@/server/http/params';
import { route } from '@/server/http/route';
import { railsOk } from '@/server/http/internal-api';
export const dynamic = 'force-dynamic';

/**
 * internal-api: POST /internal_api/messages
 *
 * Ours, not the panel's: the old API had no such route, and the panel never
 * posts a message to the app — it writes the `messages` row itself and then pings
 * `/internal_api/unread_messages`. Only our own admin conversation screen calls
 * this, with a JSON body, so it keeps the app's schema validation while sharing
 * the empty success body of the compatibility endpoints.
 */
export const POST = route(async (request) => {
  const body = z
    .object({
      conversation_id: z.coerce.number(),
      content: z.string(),
      sender_id: z.coerce.number().optional(),
      category: z.enum(['text', 'picture', 'sticker', 'service', 'internal']).optional(),
      with_unread: railsBoolean.optional(),
      with_broadcast: railsBoolean.optional(),
    })
    .parse(await requestParams(request));

  if (body.sender_id) {
    await createMessage({
      conversationId: body.conversation_id,
      senderId: body.sender_id,
      content: body.content,
      category: body.category ?? 'text',
      withUnread: body.with_unread ?? true,
      withBroadcast: body.with_broadcast ?? true,
    });
  } else {
    await createSystemMessage({
      conversationId: body.conversation_id,
      content: body.content,
      category: body.category ?? 'text',
      withUnread: body.with_unread ?? true,
      withBroadcast: body.with_broadcast ?? true,
    });
  }

  return railsOk();
});
