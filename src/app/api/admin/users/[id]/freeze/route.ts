import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requireAdmin } from '@/server/api/admin-scope';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/**
 * admin: POST /admin/users/:id/freeze — 凍結.
 *
 * Only discards the account. Every session lookup filters on discarded_at, so the
 * user is signed out and hidden, while the access level is kept for unfreezing.
 */
export const POST = route<{ id: string }>(async (_request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  await prisma.user.update({ where: { id: params.id }, data: { discardedAt: new Date() } });
  return { ok: true };
});
