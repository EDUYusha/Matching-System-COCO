import { z } from 'zod';
import { destroyBlocking } from '@/server/services/blockings';
import { requireAdmin } from '@/server/api/admin-scope';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: DELETE /admin/blockings/:id */
export const DELETE = route<{ id: string }>(async (_request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  await destroyBlocking(params.id);
  return { ok: true };
});
