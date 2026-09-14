import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requireAdmin } from '@/server/api/admin-scope';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: POST /admin/users/:id/trophies/:trophyId */
export const POST = route<{ id: string; trophyId: string }>(async (_request, { params: routeParams }) => {
  await requireAdmin();
  const params = z
    .object({ id: z.coerce.number(), trophyId: z.coerce.number() })
    .parse(routeParams);
  await prisma.userTrophy.create({ data: { userId: params.id, trophyId: params.trophyId } });
  return { ok: true };
});

/** admin: DELETE /admin/users/:id/trophies/:trophyId */
export const DELETE = route<{ id: string; trophyId: string }>(async (_request, { params: routeParams }) => {
  await requireAdmin();
  const params = z
    .object({ id: z.coerce.number(), trophyId: z.coerce.number() })
    .parse(routeParams);
  await prisma.userTrophy.deleteMany({ where: { userId: params.id, trophyId: params.trophyId } });
  return { ok: true };
});
