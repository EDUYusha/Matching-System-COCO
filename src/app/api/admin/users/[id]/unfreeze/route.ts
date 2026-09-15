import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { requireAdmin } from '@/server/api/admin-scope';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/**
 * admin: POST /admin/users/:id/unfreeze — 凍結解除.
 *
 * Undiscards the account and nothing else, so a cast who had not finished the
 * identity check or contract comes back at the same access level.
 */
export const POST = route<{ id: string }>(async (_request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: params.id }, select: { accessLevel: true } });
  if (user.accessLevel === 'ceased') {
    throw new AppError('退会済みのアカウントは「復元」から戻してください。');
  }

  await prisma.user.update({ where: { id: params.id }, data: { discardedAt: null } });
  return { ok: true };
});
