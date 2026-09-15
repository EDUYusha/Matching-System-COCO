import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requireUser } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** profiles: PATCH /profiles/:id/memo */
export const PATCH = route<{ id: string }>(async (request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z.object({ content: z.string() }).parse(await jsonBody(request));

  await prisma.userMemo.upsert({
    where: { targetId_userId: { targetId: params.id, userId: user.id } },
    create: { userId: user.id, targetId: params.id, content: body.content },
    update: { content: body.content },
  });
  return { ok: true };
});
