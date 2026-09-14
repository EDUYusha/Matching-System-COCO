import { z } from 'zod';
import { restoreUser } from '@/server/services/users';
import { requireAdmin } from '@/server/api/admin-scope';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: POST /admin/users/:id/restore */
export const POST = route<{ id: string }>(async (request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z.object({ public: z.boolean().optional() }).parse(await jsonBody(request) ?? {});
  const credentials = await restoreUser(params.id, { public: body.public });
  return { ok: true, credentials };
});
