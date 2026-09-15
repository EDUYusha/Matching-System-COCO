import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { serviceMessagesFor } from '@/server/services/service-messages';
import { requireUser } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** misc: POST /service_messages/mark_read */
export const POST = route(async (request) => {
  const user = await requireUser();
  const body = z.object({ timestamp: z.coerce.number().optional() }).parse(await jsonBody(request) ?? {});

  if (body.timestamp) {
    // the original adds a second so the message at the boundary counts as read
    await prisma.user.update({
      where: { id: user.id },
      data: { lastServiceMessageReadAt: new Date((body.timestamp + 1) * 1000) },
    });
    const remaining = await serviceMessagesFor(
      { ...user, lastServiceMessageReadAt: new Date((body.timestamp + 1) * 1000) },
      { unreadOnly: true, since: new Date((body.timestamp + 1) * 1000) },
    );
    return { ok: true, remaining: remaining.length };
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastServiceMessageReadAt: new Date() } });
  return { ok: true, remaining: 0 };
});
