import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { systemMessageToUser } from '@/server/services/messages';
import { requireAdmin } from '@/server/api/admin-scope';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: POST /admin/broadcast */
export const POST = route(async (request) => {
  await requireAdmin();
  const body = z
    .object({
      content: z.string().min(1),
      userIds: z.array(z.coerce.number()).optional(),
      userType: z.string().optional(),
      businessAreaId: z.coerce.number().optional(),
      castLevelId: z.coerce.number().optional(),
      withBroadcast: z.boolean().optional(),
    })
    .parse(await jsonBody(request));

  const recipients = body.userIds?.length
    ? await prisma.user.findMany({ where: { id: { in: body.userIds }, discardedAt: null }, select: { id: true } })
    : await prisma.user.findMany({
        where: {
          discardedAt: null,
          ...(body.userType ? { userType: body.userType as never } : {}),
          ...(body.businessAreaId ? { businessAreaId: body.businessAreaId } : {}),
          ...(body.castLevelId ? { castLevelId: body.castLevelId } : {}),
        },
        select: { id: true },
      });

  for (const recipient of recipients) {
    await systemMessageToUser(recipient.id, {
      content: body.content,
      withUnread: true,
      withBroadcast: body.withBroadcast ?? true,
    });
  }

  return { ok: true, sent: recipients.length };
});
