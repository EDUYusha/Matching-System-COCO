import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requireAdmin } from '@/server/api/admin-scope';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: POST /admin/users/:id/unfreeze */
export const POST = route<{ id: string }>(async (_request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  await prisma.user.update({ where: { id: params.id }, data: { accessLevel: 'full' } });
  return { ok: true };
});
