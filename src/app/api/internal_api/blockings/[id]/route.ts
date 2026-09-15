import { z } from 'zod';
import { destroyBlocking } from '@/server/services/blockings';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** internal-api: DELETE /internal_api/blockings/:id */
export const DELETE = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  await destroyBlocking(params.id);
  return { ok: true };
});
