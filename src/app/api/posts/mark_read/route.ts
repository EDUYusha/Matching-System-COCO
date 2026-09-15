import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requireUser } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** posts: POST /posts/mark_read */
export const POST = route(async (request) => {
  const user = await requireUser();
  const body = z.object({ startedReadingAt: z.string().optional() }).parse(await jsonBody(request) ?? {});
  await prisma.user.update({
    where: { id: user.id },
    data: { lastPostReadAt: body.startedReadingAt ? new Date(body.startedReadingAt) : new Date() },
  });
  return { ok: true };
});
