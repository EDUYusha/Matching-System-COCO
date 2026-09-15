import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** profiles: POST /profiles/:id/toggle_favorite */
export const POST = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const existing = await prisma.favorite.findUnique({
    where: { userId_targetId: { userId: user.id, targetId: params.id } },
  });
  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
    return { ok: true, favorited: false };
  }
  await prisma.favorite.create({ data: { userId: user.id, targetId: params.id } });
  return { ok: true, favorited: true };
});
